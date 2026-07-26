import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_FILE_MAX_BYTES,
  loadStory,
  type LoadStoryOptions,
  type StoryTextReader,
  type StoryTextReadOptions,
  type StoryTextReadResult,
} from "../src/index.js";

const validJson = JSON.stringify({
  schemaVersion: 1,
  id: "loaded-story",
  title: "Loaded Story",
  entryNodeId: "start",
  nodes: [
    {
      id: "start",
      text: "Choose.",
      choices: [
        {
          id: "finish",
          label: "Finish",
          nextNodeId: "ending",
        },
      ],
    },
    {
      id: "ending",
      text: "Done.",
      ending: { id: "done", title: "Done" },
    },
  ],
});

class FakeReader implements StoryTextReader {
  readonly calls: {
    readonly source: string;
    readonly options: StoryTextReadOptions;
  }[] = [];

  constructor(
    private readonly result:
      | StoryTextReadResult
      | Error
      | ((
          source: string,
          options: StoryTextReadOptions,
        ) => StoryTextReadResult | Promise<StoryTextReadResult>),
  ) {}

  async read(
    source: string,
    options: StoryTextReadOptions = {},
  ): Promise<StoryTextReadResult> {
    this.calls.push({ source, options });
    if (this.result instanceof Error) {
      throw this.result;
    }
    return typeof this.result === "function"
      ? this.result(source, options)
      : this.result;
  }
}

function successfulRead(
  text = validJson,
  sourceName = "./stories/loaded.json",
): StoryTextReadResult {
  return {
    ok: true,
    sourceName,
    text,
    byteLength: Buffer.byteLength(text, "utf8"),
  };
}

describe("loadStory", () => {
  it("loads a valid story and preserves source metadata", async () => {
    const readResult = successfulRead();
    const reader = new FakeReader(readResult);

    const result = await loadStory(
      reader,
      "./stories/loaded.json",
    );

    expect(result).toMatchObject({
      ok: true,
      sourceName: "./stories/loaded.json",
      byteLength: readResult.ok ? readResult.byteLength : -1,
      story: {
        schemaVersion: 1,
        id: "loaded-story",
        entryNodeId: "start",
      },
      diagnostics: [],
    });
    expect(reader.calls).toHaveLength(1);
  });

  it("calls the reader exactly once and forwards resolved options", async () => {
    const controller = new AbortController();
    const reader = new FakeReader(successfulRead());

    await loadStory(reader, "story.json", {
      maxBytes: 4096,
      signal: controller.signal,
    });

    expect(reader.calls).toEqual([
      {
        source: "story.json",
        options: {
          maxBytes: 4096,
          signal: controller.signal,
        },
      },
    ]);
  });

  it("forwards the exported default size when maxBytes is omitted", async () => {
    const reader = new FakeReader(successfulRead());

    await loadStory(reader, "story.json");

    expect(reader.calls[0]?.options).toEqual({
      maxBytes: DEFAULT_STORY_FILE_MAX_BYTES,
    });
  });

  it("distinguishes malformed JSON and identifies its source", async () => {
    const reader = new FakeReader(
      successfulRead("{", "./stories/broken.json"),
    );

    const result = await loadStory(
      reader,
      "./stories/broken.json",
    );

    expect(result).toMatchObject({
      ok: false,
      stage: "parse",
      code: "invalid-json",
      sourceName: "./stories/broken.json",
      message: "Story JSON is invalid.",
      diagnostics: [
        {
          code: "invalid-json",
          path: "$",
          message:
            'Invalid JSON syntax in "./stories/broken.json".',
        },
      ],
    });
  });

  it.each([
    [
      "unsupported schema",
      JSON.stringify({
        schemaVersion: 2,
        id: "story",
        title: "Story",
        entryNodeId: "ending",
        nodes: [
          {
            id: "ending",
            text: "Done.",
            ending: { id: "done", title: "Done" },
          },
        ],
      }),
      "unsupported-schema-version",
      "$.schemaVersion",
    ],
    [
      "structurally invalid story",
      JSON.stringify({
        schemaVersion: 1,
        id: "story",
        title: "",
        entryNodeId: "ending",
        nodes: [],
      }),
      "invalid-document-structure",
      "$.title",
    ],
    [
      "graph-invalid story",
      JSON.stringify({
        schemaVersion: 1,
        id: "story",
        title: "Story",
        entryNodeId: "start",
        nodes: [
          {
            id: "start",
            text: "Choose.",
            choices: [
              {
                id: "leave",
                label: "Leave",
                nextNodeId: "missing",
              },
            ],
          },
        ],
      }),
      "missing-choice-target",
      "$.nodes[0].choices[0].nextNodeId",
    ],
  ])(
    "returns validation diagnostics for an %s",
    async (_label, json, diagnosticCode, diagnosticPath) => {
      const reader = new FakeReader(successfulRead(json, "invalid.json"));

      const result = await loadStory(reader, "invalid.json");

      expect(result).toMatchObject({
        ok: false,
        stage: "validation",
        code: "invalid-story",
        sourceName: "invalid.json",
        message: "Story document failed validation.",
      });
      if (!result.ok) {
        expect(result.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: diagnosticCode,
              path: diagnosticPath,
            }),
          ]),
        );
      }
    },
  );

  it("preserves all parser diagnostic paths and messages", async () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      id: "story",
      title: "Story",
      entryNodeId: "missing",
      nodes: [
        {
          id: "start",
          text: "Choose.",
          choices: [
            {
              id: "go",
              label: "Go",
              nextNodeId: "also-missing",
            },
          ],
        },
      ],
    });
    const reader = new FakeReader(successfulRead(json, "graph.json"));

    const result = await loadStory(reader, "graph.json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.sourceName).toBe("graph.json");
      expect(result.diagnostics?.map((item) => item.path)).toContain(
        "$.nodes[0].choices[0].nextNodeId",
      );
      expect(result.diagnostics?.map((item) => item.path)).toContain(
        "$.entryNodeId",
      );
    }
  });

  it("maps a specific read failure without invoking parsing", async () => {
    const reader = new FakeReader({
      ok: false,
      code: "file-not-found",
      sourceName: "./missing.json",
      message: "Story file was not found: ./missing.json",
    });

    const result = await loadStory(reader, "./missing.json");

    expect(result).toEqual({
      ok: false,
      stage: "read",
      code: "read-failed",
      readCode: "file-not-found",
      sourceName: "./missing.json",
      message: "Story file was not found: ./missing.json",
    });
  });

  it("returns cancellation before reading", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader = new FakeReader(successfulRead());

    const result = await loadStory(reader, "story.json", {
      signal: controller.signal,
      maxBytes: 0,
    });

    expect(result).toEqual({
      ok: false,
      stage: "read",
      code: "cancelled",
      readCode: "read-cancelled",
      sourceName: "story.json",
      message: "Story loading was cancelled.",
    });
    expect(reader.calls).toEqual([]);
  });

  it("returns cancellation after reading and before parsing", async () => {
    const controller = new AbortController();
    const reader = new FakeReader(() => {
      controller.abort();
      return successfulRead("{ definitely not JSON", "story.json");
    });

    const result = await loadStory(reader, "story.json", {
      signal: controller.signal,
    });

    expect(result).toEqual({
      ok: false,
      stage: "read",
      code: "cancelled",
      readCode: "read-cancelled",
      sourceName: "story.json",
      message: "Story loading was cancelled.",
    });
  });

  it("maps reader cancellation to the same loading result", async () => {
    const reader = new FakeReader({
      ok: false,
      code: "read-cancelled",
      sourceName: "story.json",
      message: "Reader-specific cancellation.",
    });

    const result = await loadStory(reader, "story.json");

    expect(result).toEqual({
      ok: false,
      stage: "read",
      code: "cancelled",
      readCode: "read-cancelled",
      sourceName: "story.json",
      message: "Story loading was cancelled.",
    });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s maxBytes value before reading", async (_label, maxBytes) => {
    const reader = new FakeReader(successfulRead());

    const result = await loadStory(reader, "story.json", { maxBytes });

    expect(result).toEqual({
      ok: false,
      stage: "configuration",
      code: "invalid-options",
      sourceName: "story.json",
      message: "maxBytes must be a positive safe integer.",
    });
    expect(reader.calls).toEqual([]);
  });

  it("rejects a reader result over the configured limit before parsing", async () => {
    const reader = new FakeReader({
      ok: true,
      sourceName: "large.json",
      text: "{",
      byteLength: 11,
    });

    const result = await loadStory(reader, "large.json", {
      maxBytes: 10,
    });

    expect(result).toEqual({
      ok: false,
      stage: "read",
      code: "read-failed",
      readCode: "file-too-large",
      sourceName: "large.json",
      message: "Story source exceeds the 10-byte limit.",
    });
  });

  it("propagates an unexpected reader exception unchanged", async () => {
    const failure = new Error("reader programming defect");
    const reader = new FakeReader(failure);

    await expect(
      loadStory(reader, "story.json"),
    ).rejects.toBe(failure);
  });

  it("does not mutate source, options, reader result, or diagnostics", async () => {
    const source = "./story.json";
    const readResult = Object.freeze(successfulRead(validJson, source));
    const reader = new FakeReader(readResult);
    const options: LoadStoryOptions = Object.freeze({
      maxBytes: 8192,
    });
    const optionsSnapshot = structuredClone(options);

    const result = await loadStory(reader, source, options);

    expect(source).toBe("./story.json");
    expect(options).toEqual(optionsSnapshot);
    expect(readResult).toEqual(successfulRead(validJson, source));
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.story)).toBe(true);
      expect(Object.isFrozen(result.diagnostics)).toBe(true);
    }
  });

  it("produces equivalent results for equivalent input", async () => {
    const first = await loadStory(
      new FakeReader(successfulRead()),
      "./stories/loaded.json",
    );
    const second = await loadStory(
      new FakeReader(successfulRead()),
      "./stories/loaded.json",
    );

    expect(first).toEqual(second);
  });
});
