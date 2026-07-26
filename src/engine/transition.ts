import type {
  StoryChoiceV2,
  StoryDocument,
  StoryEffectV2,
  StoryEndingV2,
} from "../story/types.js";
import {
  createStoryView,
  engineFailure,
  inspectStorySession,
} from "./session.js";
import {
  applyEffects,
  cloneEffects,
  evaluateCondition,
} from "./state.js";
import type {
  SelectChoiceCommand,
  StoryHistoryEntry,
  StorySession,
  StoryTransitionResult,
} from "./types.js";

export function transitionStory(
  story: StoryDocument,
  session: StorySession,
  command: SelectChoiceCommand,
): StoryTransitionResult {
  const inspection = inspectStorySession(story, session);
  if (!inspection.ok) {
    return inspection;
  }

  if (!isSelectChoiceCommand(command)) {
    return engineFailure(
      "invalid-command",
      'Command must have type "select-choice" and a non-empty choiceId.',
    );
  }

  if (inspection.session.status === "ended") {
    return engineFailure(
      "session-ended",
      `The story has already ended with "${inspection.session.endingId ?? ""}".`,
    );
  }

  const choice = inspection.currentNode.choices?.find(
    (candidate) =>
      candidate.id === command.choiceId &&
      (inspection.state === undefined ||
        !("requires" in candidate) ||
        (candidate as StoryChoiceV2).requires === undefined ||
        evaluateCondition(
          (candidate as StoryChoiceV2).requires as NonNullable<
            StoryChoiceV2["requires"]
          >,
          inspection.state,
        )),
  );
  if (choice === undefined) {
    return engineFailure(
      "choice-not-found",
      `Choice "${command.choiceId}" is not available at node "${inspection.currentNode.id}".`,
    );
  }

  const targetNode = story.nodes.find(
    (node) => node.id === choice.nextNodeId,
  );
  if (targetNode === undefined) {
    return engineFailure(
      "choice-target-missing",
      `Choice "${choice.id}" targets missing node "${choice.nextNodeId}".`,
    );
  }

  let nextState = inspection.state;
  const statefulChoice = choice as StoryChoiceV2;
  const effects: readonly StoryEffectV2[] =
    story.schemaVersion === 2 && "effects" in choice
      ? (statefulChoice.effects ?? [])
      : [];
  if (nextState !== undefined) {
    const applied = applyEffects(effects, nextState);
    if (!applied.ok) {
      return engineFailure(
        "effect-failed",
        `Choice "${choice.id}" could not apply its effects: ${applied.message}`,
      );
    }
    nextState = applied.state;
    const targetEnding =
      targetNode.ending as StoryEndingV2 | undefined;
    if (
      targetEnding?.requires !== undefined &&
      !evaluateCondition(targetEnding.requires, nextState)
    ) {
      return engineFailure(
        "ending-requirements-not-met",
        `Ending "${targetEnding.id}" is not available in the current state.`,
      );
    }
  }

  const nextView = createStoryView(targetNode, nextState);
  if (nextView.status === "active" && nextView.choices.length === 0) {
    return engineFailure(
      "no-available-choices",
      `Node "${targetNode.id}" has no choices available after "${choice.id}".`,
    );
  }

  const nextStep = inspection.session.step + 1;
  const historyEntry: StoryHistoryEntry = Object.freeze({
    step: nextStep,
    fromNodeId: inspection.currentNode.id,
    choiceId: choice.id,
    toNodeId: targetNode.id,
    ...(nextState === undefined
      ? {}
      : {
          effects: cloneEffects(effects),
          flags: nextState.flags,
          inventory: nextState.inventory,
        }),
  });
  const preservedHistory = inspection.session.history.map((entry) =>
    Object.freeze({
      step: entry.step,
      fromNodeId: entry.fromNodeId,
      choiceId: entry.choiceId,
      toNodeId: entry.toNodeId,
      ...(entry.effects === undefined
        ? {}
        : { effects: cloneEffects(entry.effects) }),
      ...(entry.flags === undefined
        ? {}
        : { flags: Object.freeze({ ...entry.flags }) }),
      ...(entry.inventory === undefined
        ? {}
        : { inventory: Object.freeze([...entry.inventory]) }),
    }),
  );
  const history = Object.freeze([...preservedHistory, historyEntry]);
  const nextSession: StorySession = Object.freeze({
    storyId: story.id,
    currentNodeId: targetNode.id,
    status: targetNode.ending === undefined ? "active" : "ended",
    ...(targetNode.ending === undefined
      ? {}
      : { endingId: targetNode.ending.id }),
    step: nextStep,
    history,
    ...(nextState === undefined
      ? {}
      : {
          storySchemaVersion: 2 as const,
          flags: nextState.flags,
          inventory: nextState.inventory,
        }),
  });

  return Object.freeze({
    ok: true,
    session: nextSession,
    view: nextView,
  });
}

function isSelectChoiceCommand(
  command: SelectChoiceCommand,
): command is SelectChoiceCommand {
  const input: unknown = command;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const record = input as Readonly<Record<string, unknown>>;
  return (
    record["type"] === "select-choice" &&
    typeof record["choiceId"] === "string" &&
    record["choiceId"].length > 0
  );
}
