import { parseStoryDocument } from "../story/parser.js";
import { createDiagnostic } from "../story/diagnostics.js";
import type {
  StoryChoiceV2,
  StoryDocument,
  StoryEffectV2,
  StoryEndingV2,
  StoryFlagValue,
  StoryNode,
} from "../story/types.js";
import {
  applyEffects,
  cloneEffects,
  evaluateCondition,
  freezeRuntimeState,
  initialRuntimeState,
  runtimeStatesEqual,
} from "./state.js";
import type {
  StoryEngineFailure,
  StoryHistoryEntry,
  StorySession,
  StorySessionCreationResult,
  StoryTransitionErrorCode,
  StoryRuntimeState,
  StoryView,
  StoryViewResult,
} from "./types.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

const SESSION_FIELDS = [
  "storyId",
  "currentNodeId",
  "status",
  "endingId",
  "step",
  "history",
  "storySchemaVersion",
  "flags",
  "inventory",
] as const;

const HISTORY_FIELDS = [
  "step",
  "fromNodeId",
  "choiceId",
  "toNodeId",
  "effects",
  "flags",
  "inventory",
] as const;

export type SessionInspection =
  | {
      readonly ok: true;
      readonly session: StorySession;
      readonly currentNode: StoryNode;
      readonly state?: StoryRuntimeState;
    }
  | StoryEngineFailure;

export function createStorySession(
  story: StoryDocument,
): StorySessionCreationResult {
  const parsed = parseStoryDocument(story);
  if (!parsed.ok) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([...parsed.diagnostics]),
    });
  }

  const entryNode = parsed.story.nodes.find(
    (node) => node.id === parsed.story.entryNodeId,
  );
  if (entryNode === undefined) {
    throw new Error("Validated story is missing its entry node.");
  }

  const state = initialRuntimeState(parsed.story);
  const entryEnding =
    entryNode.ending as StoryEndingV2 | undefined;
  if (
    parsed.story.schemaVersion === 2 &&
    entryEnding?.requires !== undefined &&
    state !== undefined &&
    !evaluateCondition(entryEnding.requires, state)
  ) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([
        createDiagnostic(
          "contradictory-requirement",
          "error",
          "$.entryNodeId",
          "Entry ending requirements are not satisfied by the initial state.",
        ),
      ]),
    });
  }

  const session: StorySession = Object.freeze({
    storyId: parsed.story.id,
    currentNodeId: entryNode.id,
    status: entryNode.ending === undefined ? "active" : "ended",
    ...(entryNode.ending === undefined
      ? {}
      : { endingId: entryNode.ending.id }),
    step: 0,
    history: Object.freeze([]),
    ...(state === undefined
      ? {}
      : {
          storySchemaVersion: 2 as const,
          flags: state.flags,
          inventory: state.inventory,
        }),
  });

  return Object.freeze({ ok: true, session });
}

export function getStoryView(
  story: StoryDocument,
  session: StorySession,
): StoryViewResult {
  const inspection = inspectStorySession(story, session);
  if (!inspection.ok) {
    return inspection;
  }

  const view = createStoryView(
    inspection.currentNode,
    inspection.state,
  );
  if (view.status === "active" && view.choices.length === 0) {
    return engineFailure(
      "no-available-choices",
      `Node "${view.nodeId}" has no choices available in the current state.`,
    );
  }
  return Object.freeze({
    ok: true,
    view,
  });
}

export function inspectStorySession(
  story: StoryDocument,
  suppliedSession: StorySession,
): SessionInspection {
  try {
    return inspectStorySessionUnsafe(story, suppliedSession);
  } catch {
    return invalidSession("Session could not be inspected safely.");
  }
}

function inspectStorySessionUnsafe(
  story: StoryDocument,
  suppliedSession: StorySession,
): SessionInspection {
  const input: unknown = suppliedSession;
  if (!isRecord(input)) {
    return invalidSession("Session must be an object.");
  }
  if (!hasOnlyKeys(input, SESSION_FIELDS)) {
    return invalidSession("Session contains unsupported fields.");
  }

  const storyId = input["storyId"];
  if (typeof storyId !== "string" || storyId.length === 0) {
    return invalidSession("Session storyId must be a non-empty string.");
  }
  if (storyId !== story.id) {
    return engineFailure(
      "story-mismatch",
      `The session belongs to story "${storyId}", not "${story.id}".`,
    );
  }

  const currentNodeId = input["currentNodeId"];
  if (typeof currentNodeId !== "string" || currentNodeId.length === 0) {
    return invalidSession("Session currentNodeId must be a non-empty string.");
  }
  const currentNode = findStoryNode(story, currentNodeId);
  if (currentNode === undefined) {
    return engineFailure(
      "current-node-missing",
      `Current node "${currentNodeId}" does not exist in story "${story.id}".`,
    );
  }

  const status = input["status"];
  if (status !== "active" && status !== "ended") {
    return invalidSession('Session status must be "active" or "ended".');
  }

  const step = input["step"];
  if (
    typeof step !== "number" ||
    !Number.isSafeInteger(step) ||
    step < 0
  ) {
    return invalidSession(
      "Session step must be a non-negative safe integer.",
    );
  }

  const history = input["history"];
  if (!Array.isArray(history)) {
    return invalidSession("Session history must be an array.");
  }
  if (history.length !== step) {
    return invalidSession("Session history length must equal its step.");
  }

  let replayState = initialRuntimeState(story);
  let suppliedState: StoryRuntimeState | undefined;
  if (story.schemaVersion === 2) {
    if (input["storySchemaVersion"] !== 2) {
      return invalidSession(
        "A Story Document v2 session must contain storySchemaVersion 2.",
      );
    }
    const parsedState = inspectRuntimeState(input);
    if (!parsedState.ok) {
      return invalidSession(parsedState.message);
    }
    suppliedState = parsedState.state;
  } else if (
    hasOwn(input, "storySchemaVersion") ||
    hasOwn(input, "flags") ||
    hasOwn(input, "inventory")
  ) {
    return invalidSession(
      "A Story Document v1 session must not contain state fields.",
    );
  }

  const endingId = input["endingId"];
  if (status === "active" && hasOwn(input, "endingId")) {
    return invalidSession("An active session must not contain an endingId.");
  }
  if (
    status === "ended" &&
    (typeof endingId !== "string" || endingId.length === 0)
  ) {
    return invalidSession(
      "An ended session must contain a non-empty endingId.",
    );
  }

  let expectedFromNodeId = story.entryNodeId;
  const replayedHistory: StoryHistoryEntry[] = [];
  for (const [historyIndex, unknownEntry] of history.entries()) {
    if (!isRecord(unknownEntry)) {
      return invalidSession(
        `History entry ${String(historyIndex)} must be an object.`,
      );
    }
    if (!hasOnlyKeys(unknownEntry, HISTORY_FIELDS)) {
      return invalidSession(
        `History entry ${String(historyIndex)} contains unsupported fields.`,
      );
    }

    const expectedStep = historyIndex + 1;
    if (unknownEntry["step"] !== expectedStep) {
      return invalidSession(
        `History entry ${String(historyIndex)} must have step ${String(expectedStep)}.`,
      );
    }

    const fromNodeId = unknownEntry["fromNodeId"];
    const choiceId = unknownEntry["choiceId"];
    const toNodeId = unknownEntry["toNodeId"];
    if (
      !isNonEmptyString(fromNodeId) ||
      !isNonEmptyString(choiceId) ||
      !isNonEmptyString(toNodeId)
    ) {
      return invalidSession(
        `History entry ${String(historyIndex)} must contain non-empty string IDs.`,
      );
    }

    if (fromNodeId !== expectedFromNodeId) {
      return invalidSession(
        `History entry ${String(historyIndex)} does not continue from node "${expectedFromNodeId}".`,
      );
    }

    const fromNode = findStoryNode(story, fromNodeId);
    if (fromNode === undefined) {
      return invalidSession(
        `History entry ${String(historyIndex)} starts at missing node "${fromNodeId}".`,
      );
    }
    const choice = fromNode.choices?.find(
      (candidate) => candidate.id === choiceId,
    );
    if (choice === undefined) {
      return invalidSession(
        `History entry ${String(historyIndex)} uses unavailable choice "${choiceId}" at node "${fromNodeId}".`,
      );
    }
    if (choice.nextNodeId !== toNodeId) {
      return invalidSession(
        `History entry ${String(historyIndex)} has target "${toNodeId}", expected "${choice.nextNodeId}".`,
      );
    }
    if (findStoryNode(story, toNodeId) === undefined) {
      return invalidSession(
        `History entry ${String(historyIndex)} targets missing node "${toNodeId}".`,
      );
    }

    if (story.schemaVersion === 2 && replayState !== undefined) {
      const statefulChoice = choice as StoryChoiceV2;
      if (
        statefulChoice.requires !== undefined &&
        !evaluateCondition(statefulChoice.requires, replayState)
      ) {
        return invalidSession(
          `History entry ${String(historyIndex)} uses hidden choice "${choiceId}".`,
        );
      }
      const expectedEffects = statefulChoice.effects ?? [];
      if (!effectsEqual(unknownEntry["effects"], expectedEffects)) {
        return invalidSession(
          `History entry ${String(historyIndex)} effects do not match choice "${choiceId}".`,
        );
      }
      const applied = applyEffects(expectedEffects, replayState);
      if (!applied.ok) {
        return invalidSession(
          `History entry ${String(historyIndex)} contains a failing effect: ${applied.message}`,
        );
      }
      const entryState = inspectRuntimeState(unknownEntry);
      if (!entryState.ok) {
        return invalidSession(
          `History entry ${String(historyIndex)} ${entryState.message}`,
        );
      }
      if (!runtimeStatesEqual(entryState.state, applied.state)) {
        return invalidSession(
          `History entry ${String(historyIndex)} state does not match its effects.`,
        );
      }
      const target = findStoryNode(story, toNodeId);
      const targetEnding =
        target?.ending as StoryEndingV2 | undefined;
      if (
        targetEnding?.requires !== undefined &&
        !evaluateCondition(targetEnding.requires, applied.state)
      ) {
        return invalidSession(
          `History entry ${String(historyIndex)} reaches an unavailable ending.`,
        );
      }
      replayState = applied.state;
      replayedHistory.push(
        Object.freeze({
          step: expectedStep,
          fromNodeId,
          choiceId,
          toNodeId,
          effects: cloneEffects(expectedEffects),
          flags: entryState.state.flags,
          inventory: entryState.state.inventory,
        }),
      );
    } else if (
      hasOwn(unknownEntry, "effects") ||
      hasOwn(unknownEntry, "flags") ||
      hasOwn(unknownEntry, "inventory")
    ) {
      return invalidSession(
        `History entry ${String(historyIndex)} must not contain v2 state fields.`,
      );
    } else {
      replayedHistory.push(
        Object.freeze({
          step: expectedStep,
          fromNodeId,
          choiceId,
          toNodeId,
        }),
      );
    }

    expectedFromNodeId = toNodeId;
  }

  if (currentNodeId !== expectedFromNodeId) {
    return invalidSession(
      history.length === 0
        ? `A new session must begin at entry node "${story.entryNodeId}".`
        : `Session currentNodeId must match final history target "${expectedFromNodeId}".`,
    );
  }

  if (status === "active" && currentNode.ending !== undefined) {
    return invalidSession(
      `An active session cannot point to ending node "${currentNode.id}".`,
    );
  }
  if (status === "ended" && currentNode.ending === undefined) {
    return invalidSession(
      `An ended session must point to an ending node, not "${currentNode.id}".`,
    );
  }
  if (
    status === "ended" &&
    currentNode.ending !== undefined &&
    endingId !== currentNode.ending.id
  ) {
    return invalidSession(
      `Session endingId must be "${currentNode.ending.id}" at node "${currentNode.id}".`,
    );
  }

  if (
    story.schemaVersion === 2 &&
    status === "ended" &&
    currentNode.ending !== undefined &&
    (currentNode.ending as StoryEndingV2).requires !== undefined &&
    replayState !== undefined &&
    !evaluateCondition(
      (currentNode.ending as StoryEndingV2).requires as NonNullable<
        StoryEndingV2["requires"]
      >,
      replayState,
    )
  ) {
    return invalidSession(
      `Session ending "${currentNode.ending.id}" is unavailable in its replayed state.`,
    );
  }

  if (
    story.schemaVersion === 2 &&
    replayState !== undefined &&
    suppliedState !== undefined &&
    !runtimeStatesEqual(replayState, suppliedState)
  ) {
    return invalidSession(
      "Session flags and inventory do not match its history.",
    );
  }

  const canonicalSession: StorySession = Object.freeze({
    storyId,
    currentNodeId,
    status,
    ...(status === "ended" ? { endingId: endingId as string } : {}),
    step,
    history: Object.freeze(replayedHistory),
    ...(replayState === undefined
      ? {}
      : {
          storySchemaVersion: 2 as const,
          flags: replayState.flags,
          inventory: replayState.inventory,
        }),
  });
  return Object.freeze({
    ok: true,
    session: canonicalSession,
    currentNode,
    ...(replayState === undefined ? {} : { state: replayState }),
  });
}

export function createStoryView(
  node: StoryNode,
  state?: StoryRuntimeState,
): StoryView {
  if (node.ending !== undefined) {
    return Object.freeze({
      status: "ended",
      nodeId: node.id,
      text: node.text,
      ending: Object.freeze({
        id: node.ending.id,
        title: node.ending.title,
      }),
    });
  }

  const choices = (node.choices ?? [])
    .filter(
      (choice) =>
        state === undefined ||
        !("requires" in choice) ||
        (choice as StoryChoiceV2).requires === undefined ||
        evaluateCondition(
          (choice as StoryChoiceV2).requires as NonNullable<
            StoryChoiceV2["requires"]
          >,
          state,
        ),
    )
    .map((choice) =>
      Object.freeze({
        id: choice.id,
        label: choice.label,
      }),
    );
  return Object.freeze({
    status: "active",
    nodeId: node.id,
    text: node.text,
    choices: Object.freeze(choices),
  });
}

export function engineFailure(
  code: StoryTransitionErrorCode,
  message: string,
): StoryEngineFailure {
  return Object.freeze({ ok: false, code, message });
}

function invalidSession(message: string): StoryEngineFailure {
  return engineFailure("invalid-session", message);
}

function findStoryNode(
  story: StoryDocument,
  nodeId: string,
): StoryNode | undefined {
  return story.nodes.find((node) => node.id === nodeId);
}

function inspectRuntimeState(
  input: UnknownRecord,
):
  | { readonly ok: true; readonly state: StoryRuntimeState }
  | { readonly ok: false; readonly message: string } {
  const flagsInput = input["flags"];
  if (!isRecord(flagsInput)) {
    return {
      ok: false,
      message: "flags must be an object.",
    };
  }
  const flags: Record<string, StoryFlagValue> = {};
  for (const [flag, value] of Object.entries(flagsInput)) {
    if (
      typeof value !== "boolean" &&
      typeof value !== "string" &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      return {
        ok: false,
        message: `flag "${flag}" must contain a valid scalar value.`,
      };
    }
    defineOwnValue(flags, flag, value);
  }

  const inventoryInput = input["inventory"];
  if (
    !Array.isArray(inventoryInput) ||
    !inventoryInput.every(isNonEmptyString)
  ) {
    return {
      ok: false,
      message: "inventory must be an array of non-empty item IDs.",
    };
  }
  if (new Set(inventoryInput).size !== inventoryInput.length) {
    return {
      ok: false,
      message: "inventory must not contain duplicate items.",
    };
  }
  const state = freezeRuntimeState(flags, inventoryInput);
  if (
    JSON.stringify(state.inventory) !== JSON.stringify(inventoryInput)
  ) {
    return {
      ok: false,
      message: "inventory must use deterministic sorted order.",
    };
  }
  return { ok: true, state };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function effectsEqual(
  input: unknown,
  expected: readonly StoryEffectV2[],
): boolean {
  if (!Array.isArray(input) || input.length !== expected.length) {
    return false;
  }
  return expected.every((expectedEffect, index) => {
    const candidate = input[index];
    if (!isRecord(candidate) || candidate["type"] !== expectedEffect.type) {
      return false;
    }
    switch (expectedEffect.type) {
      case "set-flag":
        return (
          hasOnlyKeys(candidate, ["type", "flag", "value"]) &&
          candidate["flag"] === expectedEffect.flag &&
          candidate["value"] === expectedEffect.value
        );
      case "add-item":
      case "remove-item":
        return (
          hasOnlyKeys(candidate, ["type", "item"]) &&
          candidate["item"] === expectedEffect.item
        );
    }
  });
}

function hasOnlyKeys(
  value: UnknownRecord,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasOwn(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function defineOwnValue(
  target: Record<string, StoryFlagValue>,
  key: string,
  value: StoryFlagValue,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
