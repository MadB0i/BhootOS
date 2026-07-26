import {
  completedResult,
  createDiagnostic,
  type StoryDiagnostic,
  type StoryValidationResult,
} from "./diagnostics.js";
import type {
  StoryConditionV2,
  StoryDocument,
  StoryDocumentV2,
} from "./types.js";

export function validateStoryDocument(
  story: StoryDocument,
): StoryValidationResult {
  const diagnostics: StoryDiagnostic[] = [];
  const nodeIndexById = new Map<string, number>();
  const endingNodeIndexById = new Map<string, number>();
  let hasDuplicateNodeId = false;

  for (const [nodeIndex, node] of story.nodes.entries()) {
    const previousNodeIndex = nodeIndexById.get(node.id);
    if (previousNodeIndex !== undefined) {
      hasDuplicateNodeId = true;
      diagnostics.push(
        createDiagnostic(
          "duplicate-node-id",
          "error",
          nodePath(nodeIndex, "id"),
          `Node ID "${node.id}" duplicates $.nodes[${String(previousNodeIndex)}].id.`,
        ),
      );
    } else {
      nodeIndexById.set(node.id, nodeIndex);
    }

    const choiceIds = new Map<string, number>();
    for (const [choiceIndex, choice] of (node.choices ?? []).entries()) {
      const previousChoiceIndex = choiceIds.get(choice.id);
      if (previousChoiceIndex !== undefined) {
        diagnostics.push(
          createDiagnostic(
            "duplicate-choice-id",
            "error",
            choicePath(nodeIndex, choiceIndex, "id"),
            `Choice ID "${choice.id}" duplicates $.nodes[${String(nodeIndex)}].choices[${String(previousChoiceIndex)}].id.`,
          ),
        );
      } else {
        choiceIds.set(choice.id, choiceIndex);
      }
    }

    if (node.ending !== undefined) {
      const previousEndingNodeIndex = endingNodeIndexById.get(node.ending.id);
      if (previousEndingNodeIndex !== undefined) {
        diagnostics.push(
          createDiagnostic(
            "duplicate-ending-id",
            "error",
            nodePath(nodeIndex, "ending.id"),
            `Ending ID "${node.ending.id}" duplicates $.nodes[${String(previousEndingNodeIndex)}].ending.id.`,
          ),
        );
      } else {
        endingNodeIndexById.set(node.ending.id, nodeIndex);
      }
    }
  }

  const entryNodeIndex = nodeIndexById.get(story.entryNodeId);
  if (entryNodeIndex === undefined) {
    diagnostics.push(
      createDiagnostic(
        "missing-entry-node",
        "error",
        "$.entryNodeId",
        `Entry node "${story.entryNodeId}" does not exist.`,
      ),
    );
  }

  let hasMissingChoiceTarget = false;
  for (const [nodeIndex, node] of story.nodes.entries()) {
    for (const [choiceIndex, choice] of (node.choices ?? []).entries()) {
      if (!nodeIndexById.has(choice.nextNodeId)) {
        hasMissingChoiceTarget = true;
        diagnostics.push(
          createDiagnostic(
            "missing-choice-target",
            "error",
            choicePath(nodeIndex, choiceIndex, "nextNodeId"),
            `Choice target "${choice.nextNodeId}" does not exist.`,
          ),
        );
      }
    }
  }

  for (const [nodeIndex, node] of story.nodes.entries()) {
    if (
      node.ending === undefined &&
      (node.choices === undefined || node.choices.length === 0)
    ) {
      diagnostics.push(
        createDiagnostic(
          "node-without-choices-or-ending",
          "error",
          `$.nodes[${String(nodeIndex)}]`,
          `Node "${node.id}" must contain choices or an ending.`,
        ),
      );
    }

    if (node.ending !== undefined && node.choices !== undefined) {
      diagnostics.push(
        createDiagnostic(
          "ending-node-containing-choices",
          "error",
          nodePath(nodeIndex, "choices"),
          `Ending node "${node.id}" must not contain choices.`,
        ),
      );
    }
  }

  if (
    entryNodeIndex !== undefined &&
    !hasDuplicateNodeId &&
    !hasMissingChoiceTarget
  ) {
    diagnostics.push(
      ...validateReachability(story, nodeIndexById, entryNodeIndex),
    );
  }

  if (story.schemaVersion === 2) {
    diagnostics.push(...validateStatefulSemantics(story));
  }

  return completedResult(story, diagnostics);
}

function validateReachability(
  story: StoryDocument,
  nodeIndexById: ReadonlyMap<string, number>,
  entryNodeIndex: number,
): readonly StoryDiagnostic[] {
  const diagnostics: StoryDiagnostic[] = [];
  const adjacency = story.nodes.map((node) =>
    (node.choices ?? []).map((choice) => requiredIndex(nodeIndexById, choice.nextNodeId)),
  );
  const reverseAdjacency = story.nodes.map(() => [] as number[]);

  for (const [fromIndex, targets] of adjacency.entries()) {
    for (const targetIndex of targets) {
      reverseAdjacency[targetIndex]?.push(fromIndex);
    }
  }

  const reachable = traverse([entryNodeIndex], adjacency);
  const endingNodeIndices = story.nodes
    .map((node, index) => (node.ending === undefined ? undefined : index))
    .filter((index): index is number => index !== undefined);
  const reachableEndingIndices = endingNodeIndices.filter((index) =>
    reachable.has(index),
  );

  if (reachableEndingIndices.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "no-reachable-ending",
        "error",
        "$.entryNodeId",
        `No ending is reachable from entry node "${story.entryNodeId}".`,
      ),
    );
  }

  for (const [nodeIndex, node] of story.nodes.entries()) {
    if (!reachable.has(nodeIndex)) {
      diagnostics.push(
        createDiagnostic(
          "unreachable-node",
          "warning",
          `$.nodes[${String(nodeIndex)}]`,
          `Node "${node.id}" is unreachable from the entry node.`,
        ),
      );
    }
  }

  for (const nodeIndex of endingNodeIndices) {
    const node = story.nodes[nodeIndex];
    if (node !== undefined && !reachable.has(nodeIndex)) {
      diagnostics.push(
        createDiagnostic(
          "unreachable-ending",
          "warning",
          nodePath(nodeIndex, "ending"),
          `Ending "${node.ending?.id ?? ""}" is unreachable from the entry node.`,
        ),
      );
    }
  }

  const canReachEnding = traverse(endingNodeIndices, reverseAdjacency);
  for (const nodeIndex of reachable) {
    const node = story.nodes[nodeIndex];
    if (
      node !== undefined &&
      node.ending === undefined &&
      !canReachEnding.has(nodeIndex)
    ) {
      diagnostics.push(
        createDiagnostic(
          "reachable-node-without-ending-path",
          "warning",
          `$.nodes[${String(nodeIndex)}]`,
          `Reachable node "${node.id}" has no path to an ending.`,
        ),
      );
    }
  }

  return diagnostics;
}

function validateStatefulSemantics(
  story: StoryDocumentV2,
): readonly StoryDiagnostic[] {
  const diagnostics: StoryDiagnostic[] = [];
  const flagIds = new Set(Object.keys(story.initialState.flags));
  const potentiallyAvailableItems = new Set(
    story.initialState.inventory,
  );
  for (const node of story.nodes) {
    for (const choice of node.choices ?? []) {
      for (const effect of choice.effects ?? []) {
        if (effect.type === "add-item") {
          potentiallyAvailableItems.add(effect.item);
        }
      }
    }
  }

  for (const [nodeIndex, node] of story.nodes.entries()) {
    const choices = node.choices ?? [];
    let impossibleChoices = 0;
    for (const [choiceIndex, choice] of choices.entries()) {
      const path = `$.nodes[${String(nodeIndex)}].choices[${String(choiceIndex)}]`;
      if (choice.requires !== undefined) {
        validateConditionReferences(
          choice.requires,
          `${path}.requires`,
          flagIds,
          diagnostics,
        );
        if (isStaticallyContradictory(choice.requires)) {
          impossibleChoices += 1;
          diagnostics.push(
            createDiagnostic(
              "contradictory-requirement",
              "error",
              `${path}.requires`,
              "Choice requirement is always false.",
            ),
          );
        }
      }
      for (const [effectIndex, effect] of (
        choice.effects ?? []
      ).entries()) {
        if (effect.type === "set-flag" && !flagIds.has(effect.flag)) {
          diagnostics.push(
            createDiagnostic(
              "unknown-flag",
              "error",
              `${path}.effects[${String(effectIndex)}].flag`,
              `Effect references undeclared flag "${effect.flag}".`,
            ),
          );
        }
        if (
          effect.type === "remove-item" &&
          !potentiallyAvailableItems.has(effect.item)
        ) {
          diagnostics.push(
            createDiagnostic(
              "invalid-effect",
              "error",
              `${path}.effects[${String(effectIndex)}].item`,
              `Item "${effect.item}" can never be present before removal.`,
            ),
          );
        }
      }
    }

    if (
      choices.length > 0 &&
      impossibleChoices === choices.length
    ) {
      diagnostics.push(
        createDiagnostic(
          "no-statically-visible-choice",
          "error",
          `$.nodes[${String(nodeIndex)}].choices`,
          `Node "${node.id}" has no choice that can ever become visible.`,
        ),
      );
    }

    if (node.ending?.requires !== undefined) {
      const path = `$.nodes[${String(nodeIndex)}].ending.requires`;
      validateConditionReferences(
        node.ending.requires,
        path,
        flagIds,
        diagnostics,
      );
      if (isStaticallyContradictory(node.ending.requires)) {
        diagnostics.push(
          createDiagnostic(
            "contradictory-requirement",
            "error",
            path,
            "Ending requirement is always false.",
          ),
        );
      }
    }
  }

  return diagnostics;
}

function validateConditionReferences(
  condition: StoryConditionV2,
  path: string,
  flagIds: ReadonlySet<string>,
  diagnostics: StoryDiagnostic[],
): void {
  switch (condition.type) {
    case "flag-equals":
      if (!flagIds.has(condition.flag)) {
        diagnostics.push(
          createDiagnostic(
            "unknown-flag",
            "error",
            `${path}.flag`,
            `Condition references undeclared flag "${condition.flag}".`,
          ),
        );
      }
      break;
    case "has-item":
      break;
    case "not":
      validateConditionReferences(
        condition.condition,
        `${path}.condition`,
        flagIds,
        diagnostics,
      );
      break;
    case "all":
    case "any":
      for (const [index, nested] of condition.conditions.entries()) {
        validateConditionReferences(
          nested,
          `${path}.conditions[${String(index)}]`,
          flagIds,
          diagnostics,
        );
      }
      break;
  }
}

function isStaticallyContradictory(
  condition: StoryConditionV2,
): boolean {
  if (condition.type === "any") {
    return condition.conditions.every(isStaticallyContradictory);
  }
  if (condition.type !== "all") {
    return false;
  }
  if (condition.conditions.some(isStaticallyContradictory)) {
    return true;
  }

  const positive = new Set<string>();
  const negative = new Set<string>();
  const flagValues = new Map<string, string>();
  for (const nested of condition.conditions) {
    const atom = conditionAtom(nested);
    if (atom === undefined) {
      continue;
    }
    if (atom.negative) {
      negative.add(atom.key);
    } else {
      positive.add(atom.key);
    }
    if (positive.has(atom.key) && negative.has(atom.key)) {
      return true;
    }
    if (!atom.negative && atom.flag !== undefined) {
      const previous = flagValues.get(atom.flag);
      if (previous !== undefined && previous !== atom.value) {
        return true;
      }
      flagValues.set(atom.flag, atom.value);
    }
  }
  return false;
}

function conditionAtom(
  condition: StoryConditionV2,
):
  | {
      readonly key: string;
      readonly negative: boolean;
      readonly flag?: string;
      readonly value: string;
    }
  | undefined {
  if (condition.type === "flag-equals") {
    const value = JSON.stringify(condition.value);
    return {
      key: `flag:${condition.flag}:${value}`,
      negative: false,
      flag: condition.flag,
      value,
    };
  }
  if (condition.type === "has-item") {
    return {
      key: `item:${condition.item}`,
      negative: false,
      value: "",
    };
  }
  if (
    condition.type === "not" &&
    (condition.condition.type === "flag-equals" ||
      condition.condition.type === "has-item")
  ) {
    const atom = conditionAtom(condition.condition);
    return atom === undefined
      ? undefined
      : { ...atom, negative: true };
  }
  return undefined;
}

function traverse(
  initialNodeIndices: readonly number[],
  adjacency: readonly (readonly number[])[],
): ReadonlySet<number> {
  const visited = new Set<number>();
  const queue = [...initialNodeIndices];
  let cursor = 0;

  while (cursor < queue.length) {
    const nodeIndex = queue[cursor];
    cursor += 1;
    if (nodeIndex === undefined || visited.has(nodeIndex)) {
      continue;
    }

    visited.add(nodeIndex);
    for (const targetIndex of adjacency[nodeIndex] ?? []) {
      if (!visited.has(targetIndex)) {
        queue.push(targetIndex);
      }
    }
  }

  return visited;
}

function requiredIndex(
  nodeIndexById: ReadonlyMap<string, number>,
  nodeId: string,
): number {
  const nodeIndex = nodeIndexById.get(nodeId);
  if (nodeIndex === undefined) {
    throw new Error(`Missing node index for validated target "${nodeId}"`);
  }
  return nodeIndex;
}

function nodePath(nodeIndex: number, property: string): string {
  return `$.nodes[${String(nodeIndex)}].${property}`;
}

function choicePath(
  nodeIndex: number,
  choiceIndex: number,
  property: string,
): string {
  return `$.nodes[${String(nodeIndex)}].choices[${String(choiceIndex)}].${property}`;
}
