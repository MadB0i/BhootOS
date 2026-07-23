import type { StoryDocumentV1 } from "../story/types.js";
import {
  createStoryView,
  engineFailure,
  inspectStorySession,
} from "./session.js";
import type {
  SelectChoiceCommand,
  StoryHistoryEntry,
  StorySession,
  StoryTransitionResult,
} from "./types.js";

export function transitionStory(
  story: StoryDocumentV1,
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
    (candidate) => candidate.id === command.choiceId,
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

  const nextStep = inspection.session.step + 1;
  const historyEntry: StoryHistoryEntry = Object.freeze({
    step: nextStep,
    fromNodeId: inspection.currentNode.id,
    choiceId: choice.id,
    toNodeId: targetNode.id,
  });
  const preservedHistory = inspection.session.history.map((entry) =>
    Object.freeze({
      step: entry.step,
      fromNodeId: entry.fromNodeId,
      choiceId: entry.choiceId,
      toNodeId: entry.toNodeId,
    }),
  );
  const history = Object.freeze([...preservedHistory, historyEntry]);
  const nextSession: StorySession =
    targetNode.ending === undefined
      ? Object.freeze({
          storyId: story.id,
          currentNodeId: targetNode.id,
          status: "active",
          step: nextStep,
          history,
        })
      : Object.freeze({
          storyId: story.id,
          currentNodeId: targetNode.id,
          status: "ended",
          endingId: targetNode.ending.id,
          step: nextStep,
          history,
        });

  return Object.freeze({
    ok: true,
    session: nextSession,
    view: createStoryView(targetNode),
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
