import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";
import type { StoryDocumentV1 } from "../src/index.js";

describe("public story API", () => {
  it("exposes only the intended runtime functions", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "DEFAULT_STORY_FILE_MAX_BYTES",
      "createStorySession",
      "getStoryView",
      "loadStory",
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

  it("exports usable Story Document v1 types", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "typed-story",
      title: "Typed Story",
      entryNodeId: "finish",
      nodes: [
        {
          id: "finish",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };

    expect(publicApi.validateStoryDocument(story).ok).toBe(true);
  });

  it("parses and validates the committed minimal example", () => {
    const json = readFileSync(
      new URL("../examples/minimal-story.json", import.meta.url),
      "utf8",
    );
    const result = publicApi.parseStoryJson(json, "minimal-story.json");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
      expect(publicApi.validateStoryDocument(result.story).ok).toBe(true);
    }
  });
});
