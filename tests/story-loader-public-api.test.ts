import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_FILE_MAX_BYTES,
  loadStory,
  type LoadStoryOptions,
  type LoadStoryResult,
  type StoryLoadErrorCode,
  type StoryLoadStage,
  type StoryReadErrorCode,
  type StoryTextReader,
  type StoryTextReadResult,
} from "../src/index.js";
import * as publicApi from "../src/index.js";

describe("public story-loading API", () => {
  it("exports the platform-neutral loader without the Node adapter", () => {
    expect(DEFAULT_STORY_FILE_MAX_BYTES).toBe(1_048_576);
    expect(loadStory).toBeTypeOf("function");
    expect("createNodeStoryFileReader" in publicApi).toBe(false);
  });

  it("provides usable loading types", async () => {
    const readResult: StoryTextReadResult = {
      ok: false,
      code: "file-not-found",
      sourceName: "missing.json",
      message: "Missing.",
    };
    const reader: StoryTextReader = {
      read: async () => readResult,
    };
    const options: LoadStoryOptions = {
      maxBytes: DEFAULT_STORY_FILE_MAX_BYTES,
    };
    const readCode: StoryReadErrorCode = "file-not-found";
    const loadCode: StoryLoadErrorCode = "read-failed";
    const stage: StoryLoadStage = "read";
    const result: LoadStoryResult = await loadStory(
      reader,
      "missing.json",
      options,
    );

    expect({ readCode, loadCode, stage }).toEqual({
      readCode: "file-not-found",
      loadCode: "read-failed",
      stage: "read",
    });
    expect(result).toMatchObject({
      ok: false,
      readCode: "file-not-found",
    });
  });
});
