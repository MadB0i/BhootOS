import { describe, expect, it } from "vitest";
import {
  parseStoryDocument,
  parseStoryJson,
  type StoryDiagnosticCode,
  type StoryParseResult,
} from "../src/index.js";

function minimalInput() {
  return {
    schemaVersion: 1,
    id: "minimal-story",
    title: "Minimal Story",
    description: "A tiny example story.",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "The door is open.",
        choices: [
          {
            id: "enter",
            label: "Enter",
            nextNodeId: "ending-safe",
          },
        ],
      },
      {
        id: "ending-safe",
        text: "You made it outside.",
        ending: {
          id: "safe",
          title: "Safe",
        },
      },
    ],
  };
}

function expectDiagnostic(
  result: StoryParseResult,
  code: StoryDiagnosticCode,
  path: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code, path })]),
  );
}

describe("Story Document v1 parsing", () => {
  it("parses a valid object into an immutable story", () => {
    const result = parseStoryDocument(minimalInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story.schemaVersion).toBe(1);
      expect(result.story.nodes).toHaveLength(2);
      expect(result.diagnostics).toEqual([]);
      expect(Object.isFrozen(result.story)).toBe(true);
      expect(Object.isFrozen(result.story.nodes)).toBe(true);
      expect(Object.isFrozen(result.story.nodes[0]?.choices)).toBe(true);
    }
  });

  it("parses a valid JSON string", () => {
    const result = parseStoryJson(JSON.stringify(minimalInput()), "memory.json");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story.id).toBe("minimal-story");
    }
  });

  it("distinguishes malformed JSON syntax", () => {
    const result = parseStoryJson('{"schemaVersion":', "broken.json");

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "invalid-json",
          severity: "error",
          path: "$",
          message: 'Invalid JSON syntax in "broken.json".',
        },
      ],
    });
  });

  it("rejects unsupported schema versions", () => {
    const result = parseStoryDocument({ ...minimalInput(), schemaVersion: 3 });

    expectDiagnostic(
      result,
      "unsupported-schema-version",
      "$.schemaVersion",
    );
  });

  it("rejects unknown fields at every structure level in stable order", () => {
    const base = minimalInput();
    const result = parseStoryDocument({
      ...base,
      zeta: true,
      alpha: true,
      nodes: [
        {
          ...base.nodes[0],
          mystery: true,
          choices: [
            {
              ...base.nodes[0]?.choices?.[0],
              extra: true,
            },
          ],
        },
        {
          ...base.nodes[1],
          ending: {
            ...base.nodes[1]?.ending,
            surprise: true,
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ path }) => path)).toEqual([
      "$.alpha",
      "$.zeta",
      "$.nodes[0].mystery",
      "$.nodes[0].choices[0].extra",
      "$.nodes[1].ending.surprise",
    ]);
  });

  it("reports missing required fields with their paths", () => {
    const { title: _title, ...withoutTitle } = minimalInput();
    const result = parseStoryDocument(withoutTitle);

    expectDiagnostic(result, "invalid-document-structure", "$.title");
  });

  it("reports wrong field types with their paths", () => {
    const result = parseStoryDocument({
      ...minimalInput(),
      nodes: "not-an-array",
    });

    expectDiagnostic(result, "invalid-document-structure", "$.nodes");
  });

  it.each([
    ["Temple", "$.id"],
    ["-ending", "$.nodes[0].id"],
    ["ending-", "$.nodes[0].choices[0].id"],
    ["two--hyphens", "$.nodes[0].choices[0].nextNodeId"],
    ["room_1", "$.nodes[1].ending.id"],
  ])("rejects invalid identifier %s at %s", (identifier, expectedPath) => {
    const base = minimalInput();
    const input =
      expectedPath === "$.id"
        ? { ...base, id: identifier }
        : expectedPath === "$.nodes[0].id"
          ? {
              ...base,
              nodes: [{ ...base.nodes[0], id: identifier }, base.nodes[1]],
            }
          : expectedPath === "$.nodes[0].choices[0].id"
            ? {
                ...base,
                nodes: [
                  {
                    ...base.nodes[0],
                    choices: [
                      { ...base.nodes[0]?.choices?.[0], id: identifier },
                    ],
                  },
                  base.nodes[1],
                ],
              }
            : expectedPath === "$.nodes[0].choices[0].nextNodeId"
              ? {
                  ...base,
                  nodes: [
                    {
                      ...base.nodes[0],
                      choices: [
                        {
                          ...base.nodes[0]?.choices?.[0],
                          nextNodeId: identifier,
                        },
                      ],
                    },
                    base.nodes[1],
                  ],
                }
              : {
                  ...base,
                  nodes: [
                    base.nodes[0],
                    {
                      ...base.nodes[1],
                      ending: {
                        ...base.nodes[1]?.ending,
                        id: identifier,
                      },
                    },
                  ],
                };

    expectDiagnostic(parseStoryDocument(input), "invalid-identifier", expectedPath);
  });

  it("enforces text length limits without trimming content", () => {
    const result = parseStoryDocument({
      ...minimalInput(),
      title: "x".repeat(81),
      description: "x".repeat(501),
      nodes: [
        {
          id: "start",
          text: "",
          choices: [
            {
              id: "enter",
              label: "x".repeat(161),
              nextNodeId: "ending-safe",
            },
          ],
        },
        {
          id: "ending-safe",
          text: "x".repeat(4_001),
          ending: { id: "safe", title: "x".repeat(121) },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ path }) => path)).toEqual([
      "$.title",
      "$.description",
      "$.nodes[0].text",
      "$.nodes[0].choices[0].label",
      "$.nodes[1].text",
      "$.nodes[1].ending.title",
    ]);
  });

  it("enforces node and per-node choice counts", () => {
    const noNodes = parseStoryDocument({ ...minimalInput(), nodes: [] });
    const base = minimalInput();
    const noChoices = parseStoryDocument({
      ...base,
      nodes: [{ ...base.nodes[0], choices: [] }, base.nodes[1]],
    });

    expectDiagnostic(noNodes, "invalid-document-structure", "$.nodes");
    expectDiagnostic(
      noChoices,
      "invalid-document-structure",
      "$.nodes[0].choices",
    );
  });

  it("allows line breaks and tabs in narrative text", () => {
    const base = minimalInput();
    const result = parseStoryDocument({
      ...base,
      description: "First line\n\tSecond line",
      nodes: [
        { ...base.nodes[0], text: "A sound.\r\n\tThen silence." },
        base.nodes[1],
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unsupported control characters", () => {
    const base = minimalInput();
    const result = parseStoryDocument({
      ...base,
      nodes: [
        {
          ...base.nodes[0],
          text: "Bad\u0000text",
          choices: [
            {
              ...base.nodes[0]?.choices?.[0],
              label: "Bad\nlabel",
            },
          ],
        },
        base.nodes[1],
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ path }) => path)).toEqual([
      "$.nodes[0].text",
      "$.nodes[0].choices[0].label",
    ]);
  });

  it("does not mutate the supplied object", () => {
    const input = minimalInput();
    const snapshot = structuredClone(input);

    parseStoryDocument(input);

    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.nodes)).toBe(false);
  });

  it("does not throw while inspecting hostile unknown input", () => {
    const input = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get(): never {
        throw new Error("hostile getter");
      },
    });

    expect(() => parseStoryDocument(input)).not.toThrow();
    expectDiagnostic(
      parseStoryDocument(input),
      "invalid-document-structure",
      "$",
    );
  });
});
