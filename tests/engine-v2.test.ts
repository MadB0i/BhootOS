import { describe, expect, it } from "vitest";

import {
  createStorySession,
  getStoryView,
  transitionStory,
  type StoryDocumentV2,
  type StorySession,
} from "../src/index.js";

function statefulStory(): StoryDocumentV2 {
  return {
    schemaVersion: 2,
    id: "engine-v2",
    title: "Engine v2",
    entryNodeId: "start",
    initialState: {
      flags: { inspected: false, "door-open": false },
      inventory: [],
    },
    nodes: [
      {
        id: "start",
        text: "Start.",
        choices: [
          {
            id: "inspect",
            label: "Inspect",
            nextNodeId: "hall",
            effects: [
              {
                type: "set-flag",
                flag: "inspected",
                value: true,
              },
              { type: "add-item", item: "brass-key" },
            ],
          },
          { id: "skip", label: "Skip", nextNodeId: "hall" },
        ],
      },
      {
        id: "hall",
        text: "Hall.",
        choices: [
          {
            id: "unlock",
            label: "Unlock",
            nextNodeId: "good-ending",
            requires: {
              type: "all",
              conditions: [
                {
                  type: "flag-equals",
                  flag: "inspected",
                  value: true,
                },
                { type: "has-item", item: "brass-key" },
              ],
            },
            effects: [
              { type: "remove-item", item: "brass-key" },
              {
                type: "set-flag",
                flag: "door-open",
                value: true,
              },
            ],
          },
          {
            id: "retreat",
            label: "Retreat",
            nextNodeId: "other-ending",
          },
        ],
      },
      {
        id: "good-ending",
        text: "Open.",
        ending: {
          id: "opened",
          title: "Opened",
          requires: {
            type: "flag-equals",
            flag: "door-open",
            value: true,
          },
        },
      },
      {
        id: "other-ending",
        text: "Left.",
        ending: { id: "left", title: "Left" },
      },
    ],
  };
}

function initialSession(story: StoryDocumentV2): StorySession {
  const created = createStorySession(story);
  if (!created.ok) {
    throw new Error("v2 fixture should create a session.");
  }
  return created.session;
}

describe("Story Document v2 engine state", () => {
  it("creates immutable deterministic initial state", () => {
    const session = initialSession(statefulStory());

    expect(session).toMatchObject({
      storySchemaVersion: 2,
      flags: { inspected: false, "door-open": false },
      inventory: [],
    });
    expect(Object.isFrozen(session.flags)).toBe(true);
    expect(Object.isFrozen(session.inventory)).toBe(true);
  });

  it("filters choices using state and numbers only visible choices", () => {
    const story = statefulStory();
    const inspected = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "inspect" },
    );
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }

    expect(inspected.view).toMatchObject({
      status: "active",
      choices: [
        { id: "unlock", label: "Unlock" },
        { id: "retreat", label: "Retreat" },
      ],
    });

    const skipped = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "skip" },
    );
    expect(skipped.ok).toBe(true);
    if (skipped.ok) {
      expect(skipped.view).toMatchObject({
        status: "active",
        choices: [{ id: "retreat", label: "Retreat" }],
      });
    }
  });

  it("applies effects in order and records resulting state in history", () => {
    const story = statefulStory();
    const inspected = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "inspect" },
    );
    if (!inspected.ok) {
      throw new Error("Inspection should succeed.");
    }
    const unlocked = transitionStory(
      story,
      inspected.session,
      { type: "select-choice", choiceId: "unlock" },
    );

    expect(unlocked.ok).toBe(true);
    if (unlocked.ok) {
      expect(unlocked.session).toMatchObject({
        status: "ended",
        endingId: "opened",
        flags: { inspected: true, "door-open": true },
        inventory: [],
      });
      expect(unlocked.session.history[1]).toMatchObject({
        effects: [
          { type: "remove-item", item: "brass-key" },
          {
            type: "set-flag",
            flag: "door-open",
            value: true,
          },
        ],
        flags: { inspected: true, "door-open": true },
        inventory: [],
      });
    }
  });

  it("rejects hidden choices", () => {
    const story = statefulStory();
    const skipped = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "skip" },
    );
    if (!skipped.ok) {
      throw new Error("Skip should succeed.");
    }

    expect(
      transitionStory(story, skipped.session, {
        type: "select-choice",
        choiceId: "unlock",
      }),
    ).toEqual({
      ok: false,
      code: "choice-not-found",
      message: 'Choice "unlock" is not available at node "hall".',
    });
  });

  it("fails atomically when removing a missing item", () => {
    const story = statefulStory();
    const failing: StoryDocumentV2 = {
      ...story,
      nodes: [
        {
          id: "start",
          text: "Start.",
          choices: [
            {
              id: "remove",
              label: "Remove",
              nextNodeId: "ending",
              effects: [
                { type: "remove-item", item: "token" },
                {
                  type: "set-flag",
                  flag: "inspected",
                  value: true,
                },
              ],
            },
            {
              id: "find",
              label: "Find",
              nextNodeId: "start",
              effects: [{ type: "add-item", item: "token" }],
            },
          ],
        },
        {
          id: "ending",
          text: "End.",
          ending: { id: "end", title: "End" },
        },
      ],
    };
    const session = initialSession(failing);
    const snapshot = structuredClone(session);

    expect(
      transitionStory(failing, session, {
        type: "select-choice",
        choiceId: "remove",
      }),
    ).toMatchObject({
      ok: false,
      code: "effect-failed",
    });
    expect(session).toEqual(snapshot);
  });

  it("treats adding an existing item as an idempotent effect", () => {
    const story: StoryDocumentV2 = {
      schemaVersion: 2,
      id: "idempotent-item",
      title: "Idempotent Item",
      entryNodeId: "start",
      initialState: { flags: {}, inventory: ["token"] },
      nodes: [
        {
          id: "start",
          text: "Start.",
          choices: [
            {
              id: "add",
              label: "Add",
              nextNodeId: "ending",
              effects: [{ type: "add-item", item: "token" }],
            },
          ],
        },
        {
          id: "ending",
          text: "End.",
          ending: { id: "end", title: "End" },
        },
      ],
    };

    const result = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "add" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.inventory).toEqual(["token"]);
    }
  });

  it("rejects an ending whose requirement is not met", () => {
    const story = statefulStory();
    const inspected = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "inspect" },
    );
    if (!inspected.ok) {
      throw new Error("Inspection should succeed.");
    }
    const forgedChoiceStory: StoryDocumentV2 = {
      ...story,
      nodes: story.nodes.map((node) =>
        node.id !== "hall"
          ? node
          : {
              ...node,
              choices: [
                {
                  id: "premature",
                  label: "Premature",
                  nextNodeId: "good-ending",
                },
              ],
            },
      ),
    };

    expect(
      transitionStory(forgedChoiceStory, inspected.session, {
        type: "select-choice",
        choiceId: "premature",
      }),
    ).toMatchObject({
      ok: false,
      code: "ending-requirements-not-met",
    });
  });

  it("returns a typed failure before entering a node with no visible choices", () => {
    const story: StoryDocumentV2 = {
      schemaVersion: 2,
      id: "hidden-dead-end",
      title: "Hidden Dead End",
      entryNodeId: "start",
      initialState: { flags: { ready: false }, inventory: [] },
      nodes: [
        {
          id: "start",
          text: "Start.",
          choices: [
            { id: "enter", label: "Enter", nextNodeId: "trap" },
          ],
        },
        {
          id: "trap",
          text: "Trap.",
          choices: [
            {
              id: "leave",
              label: "Leave",
              nextNodeId: "ending",
              requires: {
                type: "flag-equals",
                flag: "ready",
                value: true,
              },
            },
          ],
        },
        {
          id: "ending",
          text: "End.",
          ending: { id: "end", title: "End" },
        },
      ],
    };

    expect(
      transitionStory(story, initialSession(story), {
        type: "select-choice",
        choiceId: "enter",
      }),
    ).toMatchObject({
      ok: false,
      code: "no-available-choices",
    });
  });

  it("rejects forged session state and history", () => {
    const story = statefulStory();
    const result = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "inspect" },
    );
    if (!result.ok) {
      throw new Error("Inspection should succeed.");
    }
    if (result.session.flags === undefined) {
      throw new Error("v2 session state is missing.");
    }
    const forged: StorySession = {
      ...structuredClone(result.session),
      flags: {
        ...result.session.flags,
        inspected: false,
      },
    };

    expect(getStoryView(story, forged)).toMatchObject({
      ok: false,
      code: "invalid-session",
    });
  });

  it("returns typed failures for hostile history values without throwing", () => {
    const story = statefulStory();
    const result = transitionStory(
      story,
      initialSession(story),
      { type: "select-choice", choiceId: "inspect" },
    );
    if (!result.ok) {
      throw new Error("Inspection should succeed.");
    }

    const bigintHistory = structuredClone(result.session) as unknown as {
      history: Array<Record<string, unknown>>;
    };
    const bigintEntry = bigintHistory.history[0];
    if (bigintEntry === undefined) {
      throw new Error("Fixture history is missing.");
    }
    bigintEntry["effects"] = [1n];

    expect(
      getStoryView(story, bigintHistory as unknown as StorySession),
    ).toMatchObject({
      ok: false,
      code: "invalid-session",
    });

    const getterHistory = structuredClone(result.session) as unknown as {
      history: Array<Record<string, unknown>>;
    };
    const getterEntry = getterHistory.history[0];
    if (getterEntry === undefined) {
      throw new Error("Fixture history is missing.");
    }
    Object.defineProperty(getterEntry, "effects", {
      enumerable: true,
      get: () => {
        throw new Error("hostile getter");
      },
    });

    expect(
      getStoryView(story, getterHistory as unknown as StorySession),
    ).toMatchObject({
      ok: false,
      code: "invalid-session",
    });
  });

  it("rejects an unsatisfied ending forged at the entry node", () => {
    const story: StoryDocumentV2 = {
      schemaVersion: 2,
      id: "guarded-entry-ending",
      title: "Guarded Entry Ending",
      entryNodeId: "ending",
      initialState: { flags: { ready: false }, inventory: [] },
      nodes: [
        {
          id: "ending",
          text: "End.",
          ending: {
            id: "end",
            title: "End",
            requires: {
              type: "flag-equals",
              flag: "ready",
              value: true,
            },
          },
        },
      ],
    };
    const forged: StorySession = {
      storyId: story.id,
      currentNodeId: story.entryNodeId,
      status: "ended",
      endingId: "end",
      step: 0,
      history: [],
      storySchemaVersion: 2,
      flags: { ready: false },
      inventory: [],
    };

    expect(getStoryView(story, forged)).toMatchObject({
      ok: false,
      code: "invalid-session",
    });
  });

  it("is deterministic for equivalent inputs", () => {
    const story = statefulStory();
    const session = initialSession(story);
    const command = { type: "select-choice", choiceId: "inspect" } as const;

    expect(transitionStory(story, session, command)).toEqual(
      transitionStory(story, session, command),
    );
  });
});
