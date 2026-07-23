import {
  completedResult,
  createDiagnostic,
  type StoryDiagnostic,
  type StoryValidationResult,
} from "./diagnostics.js";
import type { StoryDocumentV1 } from "./types.js";

export function validateStoryDocument(
  story: StoryDocumentV1,
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

  return completedResult(story, diagnostics);
}

function validateReachability(
  story: StoryDocumentV1,
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
