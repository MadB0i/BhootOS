import { describe, expect, it } from "vitest";

import {
  parseStoryDocument,
  type StoryDocumentV2,
} from "../src/index.js";

function validV2Input(): StoryDocumentV2 {
  return {
    schemaVersion: 2,
    id: "stateful-story",
    title: "Stateful Story",
    entryNodeId: "start",
    initialState: {
      flags: {
        "register-read": false,
        "door-state": "closed",
      },
      inventory: [],
    },
    nodes: [
      {
        id: "start",
        text: "The register is open.",
        choices: [
          {
            id: "read-register",
            label: "Read the register",
            nextNodeId: "ending",
            requires: {
              type: "not",
              condition: {
                type: "flag-equals",
                flag: "register-read",
                value: true,
              },
            },
            effects: [
              {
                type: "set-flag",
                flag: "register-read",
                value: true,
              },
              { type: "add-item", item: "carbon-copy" },
            ],
          },
        ],
      },
      {
        id: "ending",
        text: "The record remains.",
        ending: {
          id: "recorded",
          title: "Recorded",
          requires: {
            type: "all",
            conditions: [
              {
                type: "flag-equals",
                flag: "register-read",
                value: true,
              },
              { type: "has-item", item: "carbon-copy" },
            ],
          },
        },
      },
    ],
  };
}

function expectDiagnostic(
  input: unknown,
  code: string,
  path: string,
): void {
  const result = parseStoryDocument(input);
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code, path }),
    ]),
  );
}

describe("Story Document v2", () => {
  it("parses flags, inventory, requirements, effects, and ending requirements", () => {
    const result = parseStoryDocument(validV2Input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story.schemaVersion).toBe(2);
      if (result.story.schemaVersion === 2) {
        expect(result.story.initialState).toEqual({
          flags: {
            "door-state": "closed",
            "register-read": false,
          },
          inventory: [],
        });
        expect(result.story.nodes[0]?.choices?.[0]).toMatchObject({
          requires: { type: "not" },
          effects: [
            { type: "set-flag" },
            { type: "add-item" },
          ],
        });
      }
    }
  });

  it("rejects duplicate initial inventory items", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      initialState: { inventory: string[] };
    };
    input.initialState.inventory = ["carbon-copy", "carbon-copy"];

    expectDiagnostic(
      input,
      "duplicate-item-id",
      "$.initialState.inventory[1]",
    );
  });

  it("rejects invalid flag and item identifiers", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      initialState: {
        flags: Record<string, unknown>;
        inventory: string[];
      };
    };
    input.initialState.flags = { Bad_Flag: false };
    input.initialState.inventory = ["bad_item"];

    const result = parseStoryDocument(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "invalid-identifier",
    )).toHaveLength(2);
  });

  it("rejects unsupported condition and effect types", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      nodes: Array<{
        choices?: Array<Record<string, unknown>>;
      }>;
    };
    const choice = input.nodes[0]?.choices?.[0];
    if (choice === undefined) {
      throw new Error("Fixture choice is missing.");
    }
    choice["requires"] = { type: "javascript", expression: "true" };
    choice["effects"] = [{ type: "shell", command: "echo unsafe" }];

    const result = parseStoryDocument(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-condition" }),
        expect.objectContaining({ code: "invalid-effect" }),
      ]),
    );
  });

  it("enforces the condition depth limit", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      nodes: Array<{
        choices?: Array<Record<string, unknown>>;
      }>;
    };
    let condition: unknown = {
      type: "has-item",
      item: "carbon-copy",
    };
    for (let depth = 0; depth < 9; depth += 1) {
      condition = { type: "not", condition };
    }
    const choice = input.nodes[0]?.choices?.[0];
    if (choice === undefined) {
      throw new Error("Fixture choice is missing.");
    }
    choice["requires"] = condition;

    const result = parseStoryDocument(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "condition-limit-exceeded",
        }),
      ]),
    );
  });

  it("bounds diagnostics after the condition-count limit is exceeded", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      nodes: Array<{
        choices?: Array<Record<string, unknown>>;
      }>;
    };
    const choice = input.nodes[0]?.choices?.[0];
    if (choice === undefined) {
      throw new Error("Fixture choice is missing.");
    }
    choice["requires"] = {
      type: "all",
      conditions: Array.from({ length: 50_000 }, () => null),
    };

    const result = parseStoryDocument(input);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "condition-limit-exceeded",
      ),
    ).toHaveLength(1);
    expect(result.diagnostics.length).toBeLessThanOrEqual(64);
  });

  it("rejects undeclared flags in conditions and effects", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      nodes: Array<{
        choices?: Array<Record<string, unknown>>;
      }>;
    };
    const choice = input.nodes[0]?.choices?.[0];
    if (choice === undefined) {
      throw new Error("Fixture choice is missing.");
    }
    choice["requires"] = {
      type: "flag-equals",
      flag: "missing-flag",
      value: true,
    };
    choice["effects"] = [
      { type: "set-flag", flag: "other-missing", value: true },
    ];

    const result = parseStoryDocument(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "unknown-flag",
    )).toHaveLength(2);
  });

  it("rejects deterministically contradictory requirements", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      nodes: Array<{
        choices?: Array<Record<string, unknown>>;
      }>;
    };
    const choice = input.nodes[0]?.choices?.[0];
    if (choice === undefined) {
      throw new Error("Fixture choice is missing.");
    }
    choice["requires"] = {
      type: "all",
      conditions: [
        {
          type: "flag-equals",
          flag: "register-read",
          value: true,
        },
        {
          type: "flag-equals",
          flag: "register-read",
          value: false,
        },
      ],
    };

    const result = parseStoryDocument(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "contradictory-requirement",
        }),
        expect.objectContaining({
          code: "no-statically-visible-choice",
        }),
      ]),
    );
  });

  it("rejects item removal when the item can never exist", () => {
    const input = structuredClone(validV2Input()) as unknown as {
      nodes: Array<{
        choices?: Array<Record<string, unknown>>;
      }>;
    };
    const choice = input.nodes[0]?.choices?.[0];
    if (choice === undefined) {
      throw new Error("Fixture choice is missing.");
    }
    choice["effects"] = [
      { type: "remove-item", item: "nonexistent-token" },
    ];

    expectDiagnostic(
      input,
      "invalid-effect",
      "$.nodes[0].choices[0].effects[0].item",
    );
  });
});
