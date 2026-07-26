import { describe, expect, it } from "vitest";
import {
  createStorySession,
  getStoryView,
  parseStoryDocument,
  transitionStory,
  validateStoryDocument,
  type SelectChoiceCommand,
  type StoryDocumentV1,
  type StorySession,
  type StoryTransitionResult,
  type StoryViewResult,
} from "../src/index.js";
import * as publicApi from "../src/index.js";

describe("public engine API", () => {
  it("exposes the intended story and engine runtime functions", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "createStorySession",
      "getStoryView",
      "parseStoryDocument",
      "parseStoryJson",
      "requestStoryChoice",
      "runStory",
      "selectChoiceFromLine",
      "transitionStory",
      "validateStoryDocument",
    ]);
    expect("TerminalRenderer" in publicApi).toBe(false);
    expect("runApp" in publicApi).toBe(false);
  });

  it("retains the existing Story Document API", () => {
    expect(parseStoryDocument).toBeTypeOf("function");
    expect(validateStoryDocument).toBeTypeOf("function");
  });

  it("exports usable engine types and traverses a typed story", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "public-engine",
      title: "Public Engine",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "Start.",
          choices: [{ id: "finish", label: "Finish", nextNodeId: "ending" }],
        },
        {
          id: "ending",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };
    const created = createStorySession(story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const session: StorySession = created.session;
    const view: StoryViewResult = getStoryView(story, session);
    const command: SelectChoiceCommand = {
      type: "select-choice",
      choiceId: "finish",
    };
    const transition: StoryTransitionResult = transitionStory(
      story,
      session,
      command,
    );

    expect(view.ok && view.view.status).toBe("active");
    expect(transition.ok && transition.session.endingId).toBe("done");
  });
});
