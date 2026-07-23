import { parseStoryDocument } from "../story/parser.js";
import type {
  StoryDocumentV1,
  StoryNodeV1,
} from "../story/types.js";
import type {
  StoryEngineFailure,
  StorySession,
  StorySessionCreationResult,
  StoryTransitionErrorCode,
  StoryView,
  StoryViewResult,
} from "./types.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

export type SessionInspection =
  | {
      readonly ok: true;
      readonly session: StorySession;
      readonly currentNode: StoryNodeV1;
    }
  | StoryEngineFailure;

export function createStorySession(
  story: StoryDocumentV1,
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

  const session: StorySession =
    entryNode.ending === undefined
      ? Object.freeze({
          storyId: parsed.story.id,
          currentNodeId: entryNode.id,
          status: "active",
          step: 0,
          history: Object.freeze([]),
        })
      : Object.freeze({
          storyId: parsed.story.id,
          currentNodeId: entryNode.id,
          status: "ended",
          endingId: entryNode.ending.id,
          step: 0,
          history: Object.freeze([]),
        });

  return Object.freeze({ ok: true, session });
}

export function getStoryView(
  story: StoryDocumentV1,
  session: StorySession,
): StoryViewResult {
  const inspection = inspectStorySession(story, session);
  if (!inspection.ok) {
    return inspection;
  }

  return Object.freeze({
    ok: true,
    view: createStoryView(inspection.currentNode),
  });
}

export function inspectStorySession(
  story: StoryDocumentV1,
  suppliedSession: StorySession,
): SessionInspection {
  const input: unknown = suppliedSession;
  if (!isRecord(input)) {
    return invalidSession("Session must be an object.");
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

  const endingId = input["endingId"];
  if (status === "active" && endingId !== undefined) {
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
  for (const [historyIndex, unknownEntry] of history.entries()) {
    if (!isRecord(unknownEntry)) {
      return invalidSession(
        `History entry ${String(historyIndex)} must be an object.`,
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

  return Object.freeze({
    ok: true,
    session: suppliedSession,
    currentNode,
  });
}

export function createStoryView(node: StoryNodeV1): StoryView {
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

  const choices = (node.choices ?? []).map((choice) =>
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
  story: StoryDocumentV1,
  nodeId: string,
): StoryNodeV1 | undefined {
  return story.nodes.find((node) => node.id === nodeId);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
