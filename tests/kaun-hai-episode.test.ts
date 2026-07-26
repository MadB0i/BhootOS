import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createStorySession,
  getStoryView,
  loadStory,
  parseStoryJson,
  transitionStory,
  validateStoryDocument,
  type StoryDocument,
  type StorySession,
} from "../src/index.js";
import { createNodeStoryFileReader } from "../src/story/node-file-reader.js";

const EPISODE_PATH = resolve("episodes/kaun-hai/story.json");
const EXPECTED_ENDING_IDS = [
  "complaint-closed",
  "fourth-bell",
  "permanent-night-shift",
  "unknown-administrator",
] as const;
const MAX_EDITORIAL_TEXT_LENGTH = 700;

const ENDING_ROUTES = {
  "complaint-closed": [
    "open-complaint",
    "find-paper-entry",
    "shade-carbon",
    "enter-carbon-statement",
    "record-falsified-closure",
    "compare-audit-times",
    "mark-signature-copied",
    "state-records-only",
    "sign-as-records-witness",
  ],
  "permanent-night-shift": [
    "open-complaint",
    "query-closing-officer",
    "enter-own-name",
    "sign-night-clerk-field",
    "accept-appointment",
  ],
  "unknown-administrator": [
    "check-paper-register",
    "shade-carbon",
    "read-margin-warning",
    "press-loose-panel",
    "use-administrator-stamp",
    "execute-override",
  ],
  "fourth-bell": [
    "approach-locked-corridor",
    "read-frame-note",
    "ring-three-times",
    "ring-fourth-time",
  ],
} as const;

const CYCLE_ROUTE = [
  "open-complaint",
  "count-crow-taps",
  "count-pattern-carefully",
  "count-taps-again",
  "count-pattern-carefully",
  "doubt-note-check-corridor",
  "read-frame-note",
  "press-loose-panel",
  "transcribe-original-statement",
  "record-falsified-closure",
  "compare-audit-times",
  "mark-signature-copied",
  "state-records-only",
  "sign-as-records-witness",
] as const;

async function loadEpisode(): Promise<StoryDocument> {
  const loaded = await loadStory(
    createNodeStoryFileReader(),
    EPISODE_PATH,
  );
  if (!loaded.ok) {
    throw new Error(`Episode failed to load: ${loaded.message}`);
  }
  return loaded.story;
}

function traverse(
  story: StoryDocument,
  initialNodeId: string,
): ReadonlySet<string> {
  const nodeById = new Map(story.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const queue = [initialNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined || visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    for (const choice of node?.choices ?? []) {
      queue.push(choice.nextNodeId);
    }
  }

  return visited;
}

function playChoiceIds(
  story: StoryDocument,
  choiceIds: readonly string[],
): StorySession {
  const created = createStorySession(story);
  if (!created.ok) {
    throw new Error("Validated episode should create a session.");
  }

  let session = created.session;
  for (const [index, choiceId] of choiceIds.entries()) {
    const viewed = getStoryView(story, session);
    if (!viewed.ok || viewed.view.status !== "active") {
      throw new Error(`Route ended before choice ${String(index + 1)}.`);
    }
    const visibleChoice = viewed.view.choices.find(
      (choice) => choice.id === choiceId,
    );
    if (visibleChoice === undefined) {
      throw new Error(
        `Choice "${choiceId}" is unavailable at route step ${String(index + 1)}.`,
      );
    }

    const previousNodeId = viewed.view.nodeId;
    const transitioned = transitionStory(story, session, {
      type: "select-choice",
      choiceId,
    });
    if (!transitioned.ok) {
      throw new Error(`Choice "${choiceId}" failed: ${transitioned.message}`);
    }

    session = transitioned.session;
    const historyEntry = session.history[index];
    expect(historyEntry).toMatchObject({
      step: index + 1,
      fromNodeId: previousNodeId,
      choiceId,
      toNodeId: transitioned.view.nodeId,
    });
  }

  expect(session.step).toBe(choiceIds.length);
  expect(session.history).toHaveLength(choiceIds.length);
  return session;
}

describe("Kaun Hai? bundled episode", () => {
  it("exists and loads as strict UTF-8 without diagnostics", async () => {
    const bytes = await readFile(EPISODE_PATH);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const loaded = await loadStory(
      createNodeStoryFileReader(),
      EPISODE_PATH,
    );

    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.sourceName).toBe(EPISODE_PATH);
      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.story.id).toBe("kaun-hai");
      expect(loaded.story.title).toBe("Kaun Hai?");
      expect(loaded.story.schemaVersion).toBe(2);
    }
  });

  it("parses and validates the graph with no diagnostics", async () => {
    const json = await readFile(EPISODE_PATH, "utf8");
    const parsed = parseStoryJson(json, EPISODE_PATH);

    expect(parsed.ok).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
    if (parsed.ok) {
      expect(validateStoryDocument(parsed.story)).toEqual({
        ok: true,
        story: parsed.story,
        diagnostics: [],
      });
    }
  });

  it("has the required identity, size, endings, and active choice bounds", async () => {
    const story = await loadEpisode();
    const endingIds = story.nodes
      .flatMap((node) => (node.ending === undefined ? [] : [node.ending.id]))
      .sort();

    expect(story.id).toBe("kaun-hai");
    expect(story.title).toBe("Kaun Hai?");
    expect(story.nodes.length).toBeGreaterThanOrEqual(16);
    expect(story.nodes.length).toBeLessThanOrEqual(24);
    expect(endingIds).toEqual(EXPECTED_ENDING_IDS);

    for (const node of story.nodes) {
      if (node.ending !== undefined) {
        expect(node.choices).toBeUndefined();
        continue;
      }

      expect(node.choices?.length).toBeGreaterThanOrEqual(1);
      expect(node.choices?.length).toBeLessThanOrEqual(3);
      expect(node.choices?.every((choice) => choice.label.trim().length > 0)).toBe(
        true,
      );
      expect(new Set(node.choices?.map((choice) => choice.id)).size).toBe(
        node.choices?.length,
      );
    }
  });

  it("keeps every node and ending reachable", async () => {
    const story = await loadEpisode();
    const reachableNodeIds = traverse(story, story.entryNodeId);
    const endingNodeIds = story.nodes
      .filter((node) => node.ending !== undefined)
      .map((node) => node.id);

    expect(reachableNodeIds.size).toBe(story.nodes.length);
    expect(endingNodeIds.every((nodeId) => reachableNodeIds.has(nodeId))).toBe(
      true,
    );
  });

  it("contains an active cycle with an available exit", async () => {
    const story = await loadEpisode();
    const activeNodes = story.nodes.filter((node) => node.ending === undefined);
    const nodeById = new Map(story.nodes.map((node) => [node.id, node]));
    const cycleComponents = activeNodes
      .map((candidate) => {
        const fromCandidate = traverse(story, candidate.id);
        return activeNodes.filter(
          (other) =>
            fromCandidate.has(other.id) &&
            traverse(story, other.id).has(candidate.id),
        );
      })
      .filter((component) => component.length > 1);

    expect(cycleComponents.length).toBeGreaterThan(0);
    expect(
      cycleComponents.every((component) => {
        const componentIds = new Set(component.map((node) => node.id));
        return component.some((node) =>
          node.choices?.some((choice) => {
            if (componentIds.has(choice.nextNodeId)) {
              return false;
            }
            const target = nodeById.get(choice.nextNodeId);
            return (
              target !== undefined &&
              [...traverse(story, target.id)].some(
                (nodeId) => nodeById.get(nodeId)?.ending !== undefined,
              )
            );
          }),
        );
      }),
    ).toBe(true);
  });

  it("uses collected evidence to control the truthful resolution", async () => {
    const story = await loadEpisode();
    const created = createStorySession(story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const atComplaint = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: "open-complaint",
    });
    expect(atComplaint.ok).toBe(true);
    if (!atComplaint.ok) {
      return;
    }

    const atTerminal = transitionStory(story, atComplaint.session, {
      type: "select-choice",
      choiceId: "query-closing-officer",
    });
    expect(atTerminal.ok).toBe(true);
    if (!atTerminal.ok) {
      return;
    }

    const atTruth = transitionStory(story, atTerminal.session, {
      type: "select-choice",
      choiceId: "ask-about-devendra",
    });
    expect(atTruth.ok).toBe(true);
    if (!atTruth.ok) {
      return;
    }

    const view = getStoryView(story, atTruth.session);
    expect(view.ok).toBe(true);
    if (view.ok && view.view.status === "active") {
      expect(view.view.choices.map((choice) => choice.id)).not.toContain(
        "record-falsified-closure",
      );
    }

    const resolved = playChoiceIds(story, ENDING_ROUTES["complaint-closed"]);
    expect(resolved.flags).toMatchObject({
      "carbon-statement-entered": true,
      "closure-recorded": true,
      "signature-copied": true,
    });
    expect(resolved.inventory).toContain("carbon-copy");
  });

  it("meets editorial text and player-facing safety constraints", async () => {
    const story = await loadEpisode();
    const forbiddenDebugTerms =
      /schemaVersion|entryNodeId|nextNodeId|node ID|choice ID|ending ID|\$\.nodes/iu;
    const genericPhrases = [
      "chill run down your spine",
      "eerie silence",
      "darkness consumes",
      "sinister presence",
      "heart pounds",
      "choose your destiny",
      "what happens next",
    ];

    for (const node of story.nodes) {
      expect(node.text.length).toBeLessThanOrEqual(MAX_EDITORIAL_TEXT_LENGTH);
      expect(node.text).not.toContain("\uFFFD");
      expect(node.text).not.toMatch(forbiddenDebugTerms);
      expect(node.text).not.toMatch(/^\s*Suddenly\b/iu);
      for (const phrase of genericPhrases) {
        expect(node.text.toLowerCase()).not.toContain(phrase);
      }
      for (const choice of node.choices ?? []) {
        expect(choice.label).not.toMatch(forbiddenDebugTerms);
        expect(choice.label).not.toContain("\uFFFD");
      }
    }
  });

  it.each(Object.entries(ENDING_ROUTES))(
    "scripted route reaches %s with continuous history",
    async (endingId, choiceIds) => {
      const story = await loadEpisode();
      const session = playChoiceIds(story, choiceIds);

      expect(session.status).toBe("ended");
      expect(session.endingId).toBe(endingId);
      const finalView = getStoryView(story, session);
      expect(finalView.ok).toBe(true);
      if (finalView.ok) {
        expect(finalView.view.status).toBe("ended");
      }
    },
  );

  it("exits the optional crow cycle and reaches an ending", async () => {
    const story = await loadEpisode();
    const session = playChoiceIds(story, CYCLE_ROUTE);

    expect(session.status).toBe("ended");
    expect(session.endingId).toBe("complaint-closed");
    expect(
      session.history.filter((entry) => entry.toNodeId === "crow-window"),
    ).toHaveLength(2);
    expect(
      session.history.filter((entry) => entry.toNodeId === "tap-pattern"),
    ).toHaveLength(2);
  });

  it("replays every scripted ending deterministically", async () => {
    const story = await loadEpisode();

    for (const choiceIds of Object.values(ENDING_ROUTES)) {
      expect(playChoiceIds(story, choiceIds)).toEqual(
        playChoiceIds(story, choiceIds),
      );
    }
  });
});
