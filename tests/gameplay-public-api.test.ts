import { describe, expect, it } from "vitest";
import {
  runStory,
  type RunStoryOptions,
  type RunStoryResult,
  type StoryChoiceRequester,
  type StoryDocumentV1,
  type StoryGameplayDependencies,
  type StoryGameplayErrorCode,
  type StoryGameplayRenderer,
} from "../src/index.js";
import * as publicApi from "../src/index.js";

describe("public gameplay API", () => {
  it("exports runStory without exposing internal adapters", () => {
    expect(runStory).toBeTypeOf("function");
    expect("StoryViewRenderer" in publicApi).toBe(false);
    expect("NodeLineInput" in publicApi).toBe(false);
    expect("createStoryGameplayDependencies" in publicApi).toBe(false);
    expect("runStoryWithEngine" in publicApi).toBe(false);
  });

  it("supports the public dependency, option, result, and error types", async () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "public-gameplay",
      title: "Public Gameplay",
      entryNodeId: "ending",
      nodes: [
        {
          id: "ending",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };
    const renderer: StoryGameplayRenderer = {
      render: async () => undefined,
      renderInputError: () => undefined,
      renderTransitionError: () => undefined,
    };
    const choiceRequester: StoryChoiceRequester = {
      request: async () => ({ status: "eof" }),
    };
    const dependencies: StoryGameplayDependencies = {
      renderer,
      choiceRequester,
    };
    const options: RunStoryOptions = { maxInvalidAttempts: 3 };
    const code: StoryGameplayErrorCode = "input-failed";
    const result: RunStoryResult = await runStory(
      story,
      dependencies,
      options,
    );

    expect(code).toBe("input-failed");
    expect(result.status).toBe("ended");
  });
});
