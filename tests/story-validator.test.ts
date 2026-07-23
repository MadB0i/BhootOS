import { describe, expect, it } from "vitest";
import {
  validateStoryDocument,
  type StoryDocumentV1,
  type StoryNodeV1,
  type StoryValidationResult,
} from "../src/index.js";

function minimalStory(): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id: "minimal-story",
    title: "Minimal Story",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "Start.",
        choices: [
          { id: "continue", label: "Continue", nextNodeId: "finish" },
        ],
      },
      {
        id: "finish",
        text: "Finished.",
        ending: { id: "done", title: "Done" },
      },
    ],
  };
}

function diagnosticCodes(result: StoryValidationResult): readonly string[] {
  return result.diagnostics.map(({ code }) => code);
}

describe("Story Document v1 graph validation", () => {
  it("accepts a minimal valid story", () => {
    expect(validateStoryDocument(minimalStory())).toEqual({
      ok: true,
      story: minimalStory(),
      diagnostics: [],
    });
  });

  it("rejects duplicate node IDs", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [story.nodes[0]!, { ...story.nodes[1]!, id: "start" }],
    });

    expect(diagnosticCodes(result)).toContain("duplicate-node-id");
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate choice IDs within one node", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        {
          ...story.nodes[0]!,
          choices: [
            { id: "continue", label: "One", nextNodeId: "finish" },
            { id: "continue", label: "Two", nextNodeId: "finish" },
          ],
        },
        story.nodes[1]!,
      ],
    });

    expect(diagnosticCodes(result)).toContain("duplicate-choice-id");
  });

  it("allows the same choice ID in different nodes", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "choice-scope",
      title: "Choice Scope",
      entryNodeId: "first",
      nodes: [
        {
          id: "first",
          text: "First.",
          choices: [{ id: "next", label: "Next", nextNodeId: "second" }],
        },
        {
          id: "second",
          text: "Second.",
          choices: [{ id: "next", label: "Next", nextNodeId: "finish" }],
        },
        {
          id: "finish",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };

    expect(validateStoryDocument(story).ok).toBe(true);
  });

  it("rejects duplicate ending IDs", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        story.nodes[0]!,
        story.nodes[1]!,
        {
          id: "other-finish",
          text: "Also done.",
          ending: { id: "done", title: "Also Done" },
        },
      ],
    });

    expect(diagnosticCodes(result)).toContain("duplicate-ending-id");
  });

  it("rejects a missing entry node", () => {
    const result = validateStoryDocument({
      ...minimalStory(),
      entryNodeId: "missing",
    });

    expect(diagnosticCodes(result)).toContain("missing-entry-node");
  });

  it("rejects a missing choice target with a precise path", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        {
          ...story.nodes[0]!,
          choices: [
            { id: "continue", label: "Continue", nextNodeId: "missing" },
          ],
        },
        story.nodes[1]!,
      ],
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-choice-target",
          path: "$.nodes[0].choices[0].nextNodeId",
        }),
      ]),
    );
  });

  it.each([
    ["without choices", undefined],
    ["with an empty choices array", []],
  ] as const)("rejects a normal node %s", (_label, choices) => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        {
          id: "start",
          text: "Nowhere.",
          ...(choices === undefined ? {} : { choices }),
        },
        story.nodes[1]!,
      ],
    });

    expect(diagnosticCodes(result)).toContain("node-without-choices-or-ending");
  });

  it("rejects an ending node containing choices", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        story.nodes[0]!,
        {
          ...story.nodes[1]!,
          choices: [
            { id: "again", label: "Again", nextNodeId: "finish" },
          ],
        },
      ],
    });

    expect(diagnosticCodes(result)).toContain("ending-node-containing-choices");
  });

  it("reports an unreachable node as a warning", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        ...story.nodes,
        {
          id: "unused",
          text: "Unused.",
          choices: [
            { id: "leave", label: "Leave", nextNodeId: "finish" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "unreachable-node",
        severity: "warning",
        path: "$.nodes[2]",
      }),
    ]);
  });

  it("reports an unreachable ending separately", () => {
    const story = minimalStory();
    const result = validateStoryDocument({
      ...story,
      nodes: [
        ...story.nodes,
        {
          id: "unused-ending",
          text: "Unused ending.",
          ending: { id: "unused", title: "Unused" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(diagnosticCodes(result)).toEqual([
      "unreachable-node",
      "unreachable-ending",
    ]);
  });

  it("rejects a story with no reachable ending", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "no-ending",
      title: "No Ending",
      entryNodeId: "loop",
      nodes: [
        {
          id: "loop",
          text: "Loop.",
          choices: [{ id: "again", label: "Again", nextNodeId: "loop" }],
        },
        {
          id: "finish",
          text: "Unreachable.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };
    const result = validateStoryDocument(story);

    expect(result.ok).toBe(false);
    expect(diagnosticCodes(result)).toContain("no-reachable-ending");
  });

  it("warns about a reachable trap cycle with no ending path", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "trap-cycle",
      title: "Trap Cycle",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "Choose.",
          choices: [
            { id: "safe", label: "Safe", nextNodeId: "finish" },
            { id: "trap", label: "Trap", nextNodeId: "trap" },
          ],
        },
        {
          id: "trap",
          text: "Loop.",
          choices: [{ id: "again", label: "Again", nextNodeId: "trap" }],
        },
        {
          id: "finish",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };
    const result = validateStoryDocument(story);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "reachable-node-without-ending-path",
        path: "$.nodes[1]",
      }),
    ]);
  });

  it("allows a cycle with an exit path", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "cycle-exit",
      title: "Cycle Exit",
      entryNodeId: "first",
      nodes: [
        {
          id: "first",
          text: "First.",
          choices: [{ id: "next", label: "Next", nextNodeId: "second" }],
        },
        {
          id: "second",
          text: "Second.",
          choices: [
            { id: "back", label: "Back", nextNodeId: "first" },
            { id: "exit", label: "Exit", nextNodeId: "finish" },
          ],
        },
        {
          id: "finish",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };

    expect(validateStoryDocument(story).diagnostics).toEqual([]);
  });

  it("allows a self-loop with an exit choice", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "self-loop",
      title: "Self Loop",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "Start.",
          choices: [
            { id: "wait", label: "Wait", nextNodeId: "start" },
            { id: "exit", label: "Exit", nextNodeId: "finish" },
          ],
        },
        {
          id: "finish",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };

    expect(validateStoryDocument(story).diagnostics).toEqual([]);
  });

  it("returns diagnostics in deterministic pass and source order", () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "diagnostics",
      title: "Diagnostics",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "Start.",
          choices: [
            { id: "same", label: "Missing", nextNodeId: "missing" },
            { id: "same", label: "Finish", nextNodeId: "finish" },
          ],
        },
        {
          id: "start",
          text: "Duplicate.",
          ending: { id: "done", title: "Done" },
        },
        {
          id: "finish",
          text: "Finish.",
          ending: { id: "done", title: "Done Again" },
        },
      ],
    };

    const first = validateStoryDocument(story);
    const second = validateStoryDocument(story);

    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(diagnosticCodes(first)).toEqual([
      "duplicate-choice-id",
      "duplicate-node-id",
      "duplicate-ending-id",
      "missing-choice-target",
    ]);
  });

  it("validates a maximum-size graph without recursive traversal", () => {
    const nodes = Array.from(
      { length: 1_000 },
      (_, index): StoryNodeV1 =>
        index === 999
          ? {
              id: `n${String(index)}`,
              text: "Done.",
              ending: { id: "done", title: "Done" },
            }
          : {
              id: `n${String(index)}`,
              text: "Continue.",
              choices: [
                {
                  id: "next",
                  label: "Next",
                  nextNodeId: `n${String(index + 1)}`,
                },
              ],
            },
    );
    const result = validateStoryDocument({
      schemaVersion: 1,
      id: "maximum-story",
      title: "Maximum Story",
      entryNodeId: "n0",
      nodes,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
