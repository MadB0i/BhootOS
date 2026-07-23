import { describe, expect, it } from "vitest";
import {
  createStorySession,
  getStoryView,
  type StoryDocumentV1,
  type StorySession,
} from "../src/index.js";

function makeStory(): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id: "engine-story",
    title: "Engine Story",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "At the entrance.",
        choices: [
          { id: "enter", label: "Enter", nextNodeId: "corridor" },
          { id: "leave", label: "Leave", nextNodeId: "finish" },
        ],
      },
      {
        id: "corridor",
        text: "In the corridor.",
        choices: [
          { id: "back", label: "Go back", nextNodeId: "start" },
          { id: "finish", label: "Finish", nextNodeId: "finish" },
        ],
      },
      {
        id: "finish",
        text: "Outside.",
        ending: { id: "safe", title: "Safe" },
      },
    ],
  };
}

function initialSession(story = makeStory()): StorySession {
  const result = createStorySession(story);
  if (!result.ok) {
    throw new Error("Test story should create a session.");
  }
  return result.session;
}

function oneStepSession(): StorySession {
  return {
    storyId: "engine-story",
    currentNodeId: "corridor",
    status: "active",
    step: 1,
    history: [
      {
        step: 1,
        fromNodeId: "start",
        choiceId: "enter",
        toNodeId: "corridor",
      },
    ],
  };
}

function endedSession(): StorySession {
  return {
    storyId: "engine-story",
    currentNodeId: "finish",
    status: "ended",
    endingId: "safe",
    step: 1,
    history: [
      {
        step: 1,
        fromNodeId: "start",
        choiceId: "leave",
        toNodeId: "finish",
      },
    ],
  };
}

describe("story session creation", () => {
  it("starts a valid story at its entry node with step zero", () => {
    const result = createStorySession(makeStory());

    expect(result).toEqual({
      ok: true,
      session: {
        storyId: "engine-story",
        currentNodeId: "start",
        status: "active",
        step: 0,
        history: [],
      },
    });
  });

  it("creates an immediately ended session when the entry is an ending", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "short-story",
      title: "Short Story",
      entryNodeId: "finish",
      nodes: [
        {
          id: "finish",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };

    expect(createStorySession(story)).toEqual({
      ok: true,
      session: {
        storyId: "short-story",
        currentNodeId: "finish",
        status: "ended",
        endingId: "done",
        step: 0,
        history: [],
      },
    });
  });

  it("returns diagnostics for an invalid story", () => {
    const story = makeStory();
    const result = createStorySession({
      ...story,
      entryNodeId: "missing",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: "missing-entry-node" }),
      ]);
    }
  });

  it("does not mutate the supplied story", () => {
    const story = makeStory();
    const snapshot = structuredClone(story);

    createStorySession(story);

    expect(story).toEqual(snapshot);
    expect(Object.isFrozen(story)).toBe(false);
  });

  it("returns frozen state with an independent history array", () => {
    const story = makeStory();
    const result = createStorySession(story);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.session)).toBe(true);
      expect(Object.isFrozen(result.session.history)).toBe(true);
      expect(result.session.history).not.toBe(story.nodes);
    }
  });
});

describe("story views", () => {
  it("exposes active node text and ordered choice ID/label pairs", () => {
    const story = makeStory();
    const result = getStoryView(story, initialSession(story));

    expect(result).toEqual({
      ok: true,
      view: {
        status: "active",
        nodeId: "start",
        text: "At the entrance.",
        choices: [
          { id: "enter", label: "Enter" },
          { id: "leave", label: "Leave" },
        ],
      },
    });
    if (result.ok && result.view.status === "active") {
      expect("nextNodeId" in result.view.choices[0]!).toBe(false);
      expect(Object.isFrozen(result.view)).toBe(true);
      expect(Object.isFrozen(result.view.choices)).toBe(true);
      expect(Object.isFrozen(result.view.choices[0])).toBe(true);
    }
  });

  it("exposes an ending node and its ending details", () => {
    const result = getStoryView(makeStory(), endedSession());

    expect(result).toEqual({
      ok: true,
      view: {
        status: "ended",
        nodeId: "finish",
        text: "Outside.",
        ending: { id: "safe", title: "Safe" },
      },
    });
  });

  it("rejects a story mismatch", () => {
    const story = { ...makeStory(), id: "other-story" };
    const result = getStoryView(story, initialSession());

    expect(result).toEqual({
      ok: false,
      code: "story-mismatch",
      message:
        'The session belongs to story "engine-story", not "other-story".',
    });
  });

  it("rejects a missing current node", () => {
    const result = getStoryView(makeStory(), {
      ...initialSession(),
      currentNodeId: "missing",
    });

    expect(result).toEqual({
      ok: false,
      code: "current-node-missing",
      message:
        'Current node "missing" does not exist in story "engine-story".',
    });
  });

  it("does not mutate story or session input", () => {
    const story = makeStory();
    const session = oneStepSession();
    const storySnapshot = structuredClone(story);
    const sessionSnapshot = structuredClone(session);

    getStoryView(story, session);

    expect(story).toEqual(storySnapshot);
    expect(session).toEqual(sessionSnapshot);
  });
});

describe("story session integrity", () => {
  it.each([
    ["negative", -1],
    ["non-integer", 1.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s step", (_label, step) => {
    const result = getStoryView(makeStory(), {
      ...initialSession(),
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects history length that does not equal step", () => {
    const result = getStoryView(makeStory(), {
      ...initialSession(),
      step: 1,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects a non-sequential history step", () => {
    const session = oneStepSession();
    const result = getStoryView(makeStory(), {
      ...session,
      history: [{ ...session.history[0]!, step: 2 }],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects broken history continuity", () => {
    const result = getStoryView(makeStory(), {
      storyId: "engine-story",
      currentNodeId: "start",
      status: "active",
      step: 2,
      history: [
        {
          step: 1,
          fromNodeId: "start",
          choiceId: "enter",
          toNodeId: "corridor",
        },
        {
          step: 2,
          fromNodeId: "finish",
          choiceId: "back",
          toNodeId: "start",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects an invalid history choice", () => {
    const session = oneStepSession();
    const result = getStoryView(makeStory(), {
      ...session,
      history: [{ ...session.history[0]!, choiceId: "missing" }],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects an invalid history target", () => {
    const session = oneStepSession();
    const result = getStoryView(makeStory(), {
      ...session,
      history: [{ ...session.history[0]!, toNodeId: "finish" }],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects a history target that is missing from the story", () => {
    const story = makeStory();
    const brokenStory: StoryDocumentV1 = {
      ...story,
      nodes: [
        {
          ...story.nodes[0]!,
          choices: [
            { id: "enter", label: "Enter", nextNodeId: "missing" },
            story.nodes[0]!.choices![1]!,
          ],
        },
        ...story.nodes.slice(1),
      ],
    };
    const result = getStoryView(brokenStory, {
      storyId: "engine-story",
      currentNodeId: "start",
      status: "active",
      step: 1,
      history: [
        {
          step: 1,
          fromNodeId: "start",
          choiceId: "enter",
          toNodeId: "missing",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects a current node that differs from the final history target", () => {
    const result = getStoryView(makeStory(), {
      ...oneStepSession(),
      currentNodeId: "start",
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects an active session carrying an ending ID", () => {
    const result = getStoryView(makeStory(), {
      ...initialSession(),
      endingId: "safe",
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects an ended session without an ending ID", () => {
    const { endingId: _endingId, ...withoutEndingId } = endedSession();
    const result = getStoryView(makeStory(), withoutEndingId);

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects an ended session pointing to a normal node", () => {
    const result = getStoryView(makeStory(), {
      ...oneStepSession(),
      status: "ended",
      endingId: "safe",
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects an ending ID that differs from the current ending", () => {
    const result = getStoryView(makeStory(), {
      ...endedSession(),
      endingId: "wrong",
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects history whose origin does not begin at the entry node", () => {
    const result = getStoryView(makeStory(), {
      storyId: "engine-story",
      currentNodeId: "start",
      status: "active",
      step: 1,
      history: [
        {
          step: 1,
          fromNodeId: "corridor",
          choiceId: "back",
          toNodeId: "start",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });

  it("rejects a forged session that skips directly to an ending", () => {
    const result = getStoryView(makeStory(), {
      storyId: "engine-story",
      currentNodeId: "finish",
      status: "ended",
      endingId: "safe",
      step: 0,
      history: [],
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "invalid-session" }),
    );
  });
});
