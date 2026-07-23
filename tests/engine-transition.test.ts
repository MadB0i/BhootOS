import { describe, expect, it } from "vitest";
import {
  createStorySession,
  transitionStory,
  type SelectChoiceCommand,
  type StoryDocumentV1,
  type StorySession,
} from "../src/index.js";

function makeStory(): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id: "transition-story",
    title: "Transition Story",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "Start.",
        choices: [
          { id: "left", label: "Left", nextNodeId: "left-room" },
          { id: "right", label: "Right", nextNodeId: "right-room" },
          { id: "finish", label: "Finish", nextNodeId: "ending" },
        ],
      },
      {
        id: "left-room",
        text: "Left room.",
        choices: [{ id: "finish", label: "Finish", nextNodeId: "ending" }],
      },
      {
        id: "right-room",
        text: "Right room.",
        choices: [{ id: "finish", label: "Finish", nextNodeId: "ending" }],
      },
      {
        id: "ending",
        text: "Done.",
        ending: { id: "done", title: "Done" },
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

function select(choiceId: string): SelectChoiceCommand {
  return { type: "select-choice", choiceId };
}

function makeCycleStory(): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id: "cycle-story",
    title: "Cycle Story",
    entryNodeId: "first",
    nodes: [
      {
        id: "first",
        text: "First.",
        choices: [
          { id: "wait", label: "Wait", nextNodeId: "first" },
          { id: "next", label: "Next", nextNodeId: "second" },
        ],
      },
      {
        id: "second",
        text: "Second.",
        choices: [
          { id: "back", label: "Back", nextNodeId: "first" },
          { id: "exit", label: "Exit", nextNodeId: "ending" },
        ],
      },
      {
        id: "ending",
        text: "Done.",
        ending: { id: "done", title: "Done" },
      },
    ],
  };
}

describe("story transitions", () => {
  it("moves to the selected target and remains active", () => {
    const story = makeStory();
    const result = transitionStory(story, initialSession(story), select("left"));

    expect(result).toEqual({
      ok: true,
      session: {
        storyId: "transition-story",
        currentNodeId: "left-room",
        status: "active",
        step: 1,
        history: [
          {
            step: 1,
            fromNodeId: "start",
            choiceId: "left",
            toNodeId: "left-room",
          },
        ],
      },
      view: {
        status: "active",
        nodeId: "left-room",
        text: "Left room.",
        choices: [{ id: "finish", label: "Finish" }],
      },
    });
  });

  it("increments the step once and appends exactly one history entry", () => {
    const story = makeStory();
    const first = transitionStory(story, initialSession(story), select("left"));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = transitionStory(story, first.session, select("finish"));

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.session.step).toBe(2);
      expect(second.session.history).toHaveLength(2);
      expect(second.session.history[0]).toEqual(first.session.history[0]);
      expect(second.session.history[0]).not.toBe(first.session.history[0]);
      expect(second.session.history[1]).toEqual({
        step: 2,
        fromNodeId: "left-room",
        choiceId: "finish",
        toNodeId: "ending",
      });
    }
  });

  it("does not mutate the previous session or command", () => {
    const story = makeStory();
    const session = initialSession(story);
    const command = select("left");
    const sessionSnapshot = structuredClone(session);
    const commandSnapshot = structuredClone(command);

    const result = transitionStory(story, session, command);

    expect(result.ok).toBe(true);
    expect(session).toEqual(sessionSnapshot);
    expect(command).toEqual(commandSnapshot);
    expect(session.step).toBe(0);
    expect(session.history).toEqual([]);
  });

  it("does not reuse mutable history entries supplied by a caller", () => {
    const story = makeStory();
    const mutableEntry = {
      step: 1,
      fromNodeId: "start",
      choiceId: "left",
      toNodeId: "left-room",
    };
    const session: StorySession = {
      storyId: "transition-story",
      currentNodeId: "left-room",
      status: "active",
      step: 1,
      history: [mutableEntry],
    };
    const result = transitionStory(story, session, select("finish"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.history[0]).not.toBe(mutableEntry);
      expect(Object.isFrozen(result.session.history[0])).toBe(true);
      mutableEntry.choiceId = "changed";
      expect(result.session.history[0]?.choiceId).toBe("left");
    }
  });

  it("produces an ended session and ending view", () => {
    const story = makeStory();
    const result = transitionStory(
      story,
      initialSession(story),
      select("finish"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toEqual({
        storyId: "transition-story",
        currentNodeId: "ending",
        status: "ended",
        endingId: "done",
        step: 1,
        history: [
          {
            step: 1,
            fromNodeId: "start",
            choiceId: "finish",
            toNodeId: "ending",
          },
        ],
      });
      expect(result.view).toEqual({
        status: "ended",
        nodeId: "ending",
        text: "Done.",
        ending: { id: "done", title: "Done" },
      });
    }
  });

  it("rejects an unavailable choice", () => {
    const story = makeStory();
    const result = transitionStory(
      story,
      initialSession(story),
      select("missing"),
    );

    expect(result).toEqual({
      ok: false,
      code: "choice-not-found",
      message: 'Choice "missing" is not available at node "start".',
    });
  });

  it("rejects further choices after the story ends", () => {
    const story = makeStory();
    const ended = transitionStory(
      story,
      initialSession(story),
      select("finish"),
    );
    expect(ended.ok).toBe(true);
    if (!ended.ok) {
      return;
    }

    expect(transitionStory(story, ended.session, select("finish"))).toEqual({
      ok: false,
      code: "session-ended",
      message: 'The story has already ended with "done".',
    });
  });

  it("fails safely when the selected choice target is missing", () => {
    const story = makeStory();
    const session = initialSession(story);
    const brokenStory: StoryDocumentV1 = {
      ...story,
      nodes: [
        {
          ...story.nodes[0]!,
          choices: [
            { id: "left", label: "Left", nextNodeId: "missing" },
            ...story.nodes[0]!.choices!.slice(1),
          ],
        },
        ...story.nodes.slice(1),
      ],
    };

    expect(transitionStory(brokenStory, session, select("left"))).toEqual({
      ok: false,
      code: "choice-target-missing",
      message: 'Choice "left" targets missing node "missing".',
    });
  });

  it("returns equivalent results for identical inputs", () => {
    const story = makeStory();
    const session = initialSession(story);
    const command = select("right");

    const first = transitionStory(story, session, command);
    const second = transitionStory(story, session, command);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("keeps different choice branches independent", () => {
    const story = makeStory();
    const session = initialSession(story);

    const left = transitionStory(story, session, select("left"));
    const right = transitionStory(story, session, select("right"));

    expect(left.ok && left.session.currentNodeId).toBe("left-room");
    expect(right.ok && right.session.currentNodeId).toBe("right-room");
    expect(session.currentNodeId).toBe("start");
  });

  it("returns a typed failure for a malformed command", () => {
    const story = makeStory();
    const command = { type: "other", choiceId: "left" };
    const result = transitionStory(
      story,
      initialSession(story),
      command as unknown as SelectChoiceCommand,
    );

    expect(result).toEqual({
      ok: false,
      code: "invalid-command",
      message:
        'Command must have type "select-choice" and a non-empty choiceId.',
    });
  });

  it("returns frozen session, history, entry, and view objects", () => {
    const story = makeStory();
    const result = transitionStory(story, initialSession(story), select("left"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.session)).toBe(true);
      expect(Object.isFrozen(result.session.history)).toBe(true);
      expect(Object.isFrozen(result.session.history[0])).toBe(true);
      expect(Object.isFrozen(result.view)).toBe(true);
    }
  });
});

describe("cycle transitions", () => {
  it("records a self-loop as one active transition", () => {
    const story = makeCycleStory();
    const result = transitionStory(
      story,
      initialSession(story),
      select("wait"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.currentNodeId).toBe("first");
      expect(result.session.status).toBe("active");
      expect(result.session.step).toBe(1);
      expect(result.session.history).toEqual([
        {
          step: 1,
          fromNodeId: "first",
          choiceId: "wait",
          toNodeId: "first",
        },
      ]);
    }
  });

  it("repeats a self-loop deterministically", () => {
    const story = makeCycleStory();
    let session = initialSession(story);

    for (let count = 0; count < 3; count += 1) {
      const result = transitionStory(story, session, select("wait"));
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      session = result.session;
    }

    expect(session.step).toBe(3);
    expect(session.history).toHaveLength(3);
    expect(session.currentNodeId).toBe("first");
  });

  it("traverses a multi-node cycle", () => {
    const story = makeCycleStory();
    const first = transitionStory(story, initialSession(story), select("next"));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const back = transitionStory(story, first.session, select("back"));

    expect(back.ok && back.session.currentNodeId).toBe("first");
    expect(back.ok && back.session.step).toBe(2);
  });

  it("exits a cycle into an ending", () => {
    const story = makeCycleStory();
    const second = transitionStory(
      story,
      initialSession(story),
      select("next"),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    const ending = transitionStory(story, second.session, select("exit"));

    expect(ending.ok).toBe(true);
    if (ending.ok) {
      expect(ending.session.status).toBe("ended");
      expect(ending.session.endingId).toBe("done");
    }
  });

  it("supports a large deterministic history without a hidden step limit", () => {
    const story = makeCycleStory();
    let session = initialSession(story);

    for (let count = 0; count < 1_500; count += 1) {
      const result = transitionStory(story, session, select("wait"));
      if (!result.ok) {
        throw new Error(`Unexpected transition failure: ${result.message}`);
      }
      session = result.session;
    }

    expect(session.status).toBe("active");
    expect(session.step).toBe(1_500);
    expect(session.history).toHaveLength(1_500);
    expect(session.history[1_499]?.step).toBe(1_500);
  });
});
