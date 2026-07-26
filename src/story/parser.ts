import {
  createDiagnostic,
  failedResult,
  type StoryDiagnostic,
  type StoryParseResult,
} from "./diagnostics.js";
import type {
  StoryChoiceV1,
  StoryChoiceV2,
  StoryConditionV2,
  StoryDocument,
  StoryDocumentV2,
  StoryEffectV2,
  StoryEndingV1,
  StoryEndingV2,
  StoryFlagValue,
  StoryInitialStateV2,
  StoryNodeV1,
  StoryNodeV2,
} from "./types.js";
import { validateStoryDocument } from "./validator.js";

const IDENTIFIER_PATTERN = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/u;
const DOCUMENT_FIELDS = [
  "schemaVersion",
  "id",
  "title",
  "description",
  "entryNodeId",
  "nodes",
] as const;
const DOCUMENT_V2_FIELDS = [...DOCUMENT_FIELDS, "initialState"] as const;
const NODE_FIELDS = ["id", "text", "choices", "ending"] as const;
const CHOICE_FIELDS = ["id", "label", "nextNodeId"] as const;
const CHOICE_V2_FIELDS = [...CHOICE_FIELDS, "requires", "effects"] as const;
const ENDING_FIELDS = ["id", "title"] as const;
const ENDING_V2_FIELDS = [...ENDING_FIELDS, "requires"] as const;
const INITIAL_STATE_FIELDS = ["flags", "inventory"] as const;
const MAX_CONDITION_DEPTH = 8;
const MAX_CONDITION_COUNT = 64;
const MAX_EFFECT_COUNT = 32;

type JsonObject = Readonly<Record<string, unknown>>;

interface TextRules {
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly allowNarrativeWhitespace: boolean;
}

export function parseStoryJson(
  json: string,
  sourceName?: string,
): StoryParseResult {
  if (typeof json !== "string") {
    return failedResult([
      createDiagnostic(
        "invalid-json",
        "error",
        "$",
        "Story JSON must be a string.",
      ),
    ]);
  }

  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    const source = sourceName === undefined ? "story JSON" : `"${sourceName}"`;
    return failedResult([
      createDiagnostic(
        "invalid-json",
        "error",
        "$",
        `Invalid JSON syntax in ${source}.`,
      ),
    ]);
  }

  return parseStoryDocument(input);
}

export function parseStoryDocument(input: unknown): StoryParseResult {
  try {
    const diagnostics: StoryDiagnostic[] = [];
    const story = parseDocumentStructure(input, diagnostics);
    if (story === undefined || diagnostics.length > 0) {
      return failedResult(diagnostics);
    }

    return validateStoryDocument(story);
  } catch {
    return failedResult([
      createDiagnostic(
        "invalid-document-structure",
        "error",
        "$",
        "Story document could not be inspected safely.",
      ),
    ]);
  }
}

function parseDocumentStructure(
  input: unknown,
  diagnostics: StoryDiagnostic[],
): StoryDocument | undefined {
  const document = expectObject(input, "$", "story document", diagnostics);
  if (document === undefined) {
    return undefined;
  }

  const schemaVersion = parseSchemaVersion(document, diagnostics);
  if (schemaVersion === 2) {
    return parseDocumentV2(document, diagnostics);
  }

  rejectUnknownFields(document, DOCUMENT_FIELDS, "$", diagnostics);
  const id = parseIdentifier(document, "id", "$.id", diagnostics);
  const title = parseText(
    document,
    "title",
    "$.title",
    {
      label: "Story title",
      minimum: 1,
      maximum: 80,
      allowNarrativeWhitespace: false,
    },
    diagnostics,
  );
  const description = parseOptionalText(
    document,
    "description",
    "$.description",
    {
      label: "Description",
      minimum: 0,
      maximum: 500,
      allowNarrativeWhitespace: true,
    },
    diagnostics,
  );
  const entryNodeId = parseIdentifier(
    document,
    "entryNodeId",
    "$.entryNodeId",
    diagnostics,
  );
  const nodes = parseNodes(document, diagnostics);

  if (
    schemaVersion !== 1 ||
    id === undefined ||
    title === undefined ||
    entryNodeId === undefined ||
    nodes === undefined ||
    diagnostics.length > 0
  ) {
    return undefined;
  }

  return Object.freeze({
    schemaVersion: 1,
    id,
    title,
    ...(description === undefined ? {} : { description }),
    entryNodeId,
    nodes: Object.freeze(nodes),
  });
}

function parseSchemaVersion(
  document: JsonObject,
  diagnostics: StoryDiagnostic[],
): 1 | 2 | undefined {
  if (!hasOwn(document, "schemaVersion")) {
    diagnostics.push(missingField("$.schemaVersion", "schemaVersion"));
    return undefined;
  }

  const value = document["schemaVersion"];
  if (typeof value === "number" && value !== 1 && value !== 2) {
    diagnostics.push(
      createDiagnostic(
        "unsupported-schema-version",
        "error",
        "$.schemaVersion",
        `Schema version ${String(value)} is not supported; expected 1 or 2.`,
      ),
    );
    return undefined;
  }

  if (value !== 1 && value !== 2) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        "$.schemaVersion",
        "schemaVersion must be the number 1 or 2.",
      ),
    );
    return undefined;
  }

  return value;
}

function parseDocumentV2(
  document: JsonObject,
  diagnostics: StoryDiagnostic[],
): StoryDocumentV2 | undefined {
  rejectUnknownFields(document, DOCUMENT_V2_FIELDS, "$", diagnostics);
  const id = parseIdentifier(document, "id", "$.id", diagnostics);
  const title = parseText(
    document,
    "title",
    "$.title",
    {
      label: "Story title",
      minimum: 1,
      maximum: 80,
      allowNarrativeWhitespace: false,
    },
    diagnostics,
  );
  const description = parseOptionalText(
    document,
    "description",
    "$.description",
    {
      label: "Description",
      minimum: 0,
      maximum: 500,
      allowNarrativeWhitespace: true,
    },
    diagnostics,
  );
  const entryNodeId = parseIdentifier(
    document,
    "entryNodeId",
    "$.entryNodeId",
    diagnostics,
  );
  const initialState = parseInitialState(document, diagnostics);
  const nodes = parseNodesV2(document, diagnostics);

  if (
    id === undefined ||
    title === undefined ||
    entryNodeId === undefined ||
    initialState === undefined ||
    nodes === undefined ||
    diagnostics.length > 0
  ) {
    return undefined;
  }

  return Object.freeze({
    schemaVersion: 2,
    id,
    title,
    ...(description === undefined ? {} : { description }),
    entryNodeId,
    initialState,
    nodes: Object.freeze(nodes),
  });
}

function parseInitialState(
  document: JsonObject,
  diagnostics: StoryDiagnostic[],
): StoryInitialStateV2 | undefined {
  if (!hasOwn(document, "initialState")) {
    diagnostics.push(
      missingField("$.initialState", "initialState"),
    );
    return undefined;
  }
  const state = expectObject(
    document["initialState"],
    "$.initialState",
    "initialState",
    diagnostics,
  );
  if (state === undefined) {
    return undefined;
  }

  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(
    state,
    INITIAL_STATE_FIELDS,
    "$.initialState",
    diagnostics,
  );

  const flagsInput = state["flags"];
  const flagsObject = expectObject(
    flagsInput,
    "$.initialState.flags",
    "flags",
    diagnostics,
  );
  const flags: Record<string, StoryFlagValue> = {};
  if (flagsObject !== undefined) {
    const entries = Object.entries(flagsObject);
    if (entries.length > 128) {
      diagnostics.push(
        createDiagnostic(
          "invalid-document-structure",
          "error",
          "$.initialState.flags",
          "flags must contain at most 128 entries.",
        ),
      );
    }
    for (const [flag, value] of entries.slice(0, 128)) {
      if (
        validateIdentifierValue(
          flag,
          `$.initialState.flags[${JSON.stringify(flag)}]`,
          "flag",
          diagnostics,
        ) === undefined
      ) {
        continue;
      }
      const parsedValue = parseFlagValue(
        value,
        `$.initialState.flags[${JSON.stringify(flag)}]`,
        diagnostics,
      );
      if (parsedValue !== undefined) {
        flags[flag] = parsedValue;
      }
    }
  }

  const inventoryInput = state["inventory"];
  const inventory: string[] = [];
  if (!Array.isArray(inventoryInput)) {
    diagnostics.push(
      typeDiagnostic(
        "$.initialState.inventory",
        "inventory",
        "an array",
      ),
    );
  } else {
    if (inventoryInput.length > 128) {
      diagnostics.push(
        createDiagnostic(
          "invalid-document-structure",
          "error",
          "$.initialState.inventory",
          "inventory must contain at most 128 entries.",
        ),
      );
    }
    const seen = new Set<string>();
    for (const [index, value] of inventoryInput.slice(0, 128).entries()) {
      const path = `$.initialState.inventory[${String(index)}]`;
      const item = validateIdentifierValue(
        value,
        path,
        "item",
        diagnostics,
      );
      if (item === undefined) {
        continue;
      }
      if (seen.has(item)) {
        diagnostics.push(
          createDiagnostic(
            "duplicate-item-id",
            "error",
            path,
            `Initial inventory item "${item}" is duplicated.`,
          ),
        );
        continue;
      }
      seen.add(item);
      inventory.push(item);
    }
  }

  if (diagnostics.length > diagnosticCount) {
    return undefined;
  }
  return Object.freeze({
    flags: Object.freeze({ ...flags }),
    inventory: Object.freeze([...inventory].sort()),
  });
}

function parseNodesV2(
  document: JsonObject,
  diagnostics: StoryDiagnostic[],
): StoryNodeV2[] | undefined {
  if (!hasOwn(document, "nodes")) {
    diagnostics.push(missingField("$.nodes", "nodes"));
    return undefined;
  }
  const value = document["nodes"];
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic("$.nodes", "nodes", "an array"));
    return undefined;
  }
  if (value.length < 1 || value.length > 1_000) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        "$.nodes",
        "nodes must contain between 1 and 1000 entries.",
      ),
    );
  }

  const nodes: StoryNodeV2[] = [];
  for (const [nodeIndex, input] of value.slice(0, 1_000).entries()) {
    const node = parseNodeV2(input, nodeIndex, diagnostics);
    if (node !== undefined) {
      nodes.push(node);
    }
  }
  return nodes;
}

function parseNodeV2(
  input: unknown,
  nodeIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryNodeV2 | undefined {
  const path = `$.nodes[${String(nodeIndex)}]`;
  const node = expectObject(input, path, "node", diagnostics);
  if (node === undefined) {
    return undefined;
  }
  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(node, NODE_FIELDS, path, diagnostics);
  const id = parseIdentifier(node, "id", `${path}.id`, diagnostics);
  const text = parseText(
    node,
    "text",
    `${path}.text`,
    {
      label: "Node text",
      minimum: 1,
      maximum: 4_000,
      allowNarrativeWhitespace: true,
    },
    diagnostics,
  );
  const choices = parseOptionalChoicesV2(
    node,
    nodeIndex,
    diagnostics,
  );
  const ending = parseOptionalEndingV2(
    node,
    nodeIndex,
    diagnostics,
  );

  if (
    id === undefined ||
    text === undefined ||
    diagnostics.length > diagnosticCount
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    text,
    ...(choices === undefined
      ? {}
      : { choices: Object.freeze(choices) }),
    ...(ending === undefined ? {} : { ending }),
  });
}

function parseOptionalChoicesV2(
  node: JsonObject,
  nodeIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryChoiceV2[] | undefined {
  if (!hasOwn(node, "choices")) {
    return undefined;
  }
  const path = `$.nodes[${String(nodeIndex)}].choices`;
  const value = node["choices"];
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic(path, "choices", "an array"));
    return undefined;
  }
  if (value.length < 1 || value.length > 32) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        path,
        "choices must contain between 1 and 32 entries when present.",
      ),
    );
  }

  const choices: StoryChoiceV2[] = [];
  for (const [choiceIndex, input] of value.slice(0, 32).entries()) {
    const choice = parseChoiceV2(
      input,
      nodeIndex,
      choiceIndex,
      diagnostics,
    );
    if (choice !== undefined) {
      choices.push(choice);
    }
  }
  return choices;
}

function parseChoiceV2(
  input: unknown,
  nodeIndex: number,
  choiceIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryChoiceV2 | undefined {
  const path = `$.nodes[${String(nodeIndex)}].choices[${String(choiceIndex)}]`;
  const choice = expectObject(input, path, "choice", diagnostics);
  if (choice === undefined) {
    return undefined;
  }
  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(choice, CHOICE_V2_FIELDS, path, diagnostics);
  const id = parseIdentifier(choice, "id", `${path}.id`, diagnostics);
  const label = parseText(
    choice,
    "label",
    `${path}.label`,
    {
      label: "Choice label",
      minimum: 1,
      maximum: 160,
      allowNarrativeWhitespace: false,
    },
    diagnostics,
  );
  const nextNodeId = parseIdentifier(
    choice,
    "nextNodeId",
    `${path}.nextNodeId`,
    diagnostics,
  );
  const requires = parseOptionalCondition(
    choice,
    "requires",
    `${path}.requires`,
    diagnostics,
  );
  const effects = parseOptionalEffects(
    choice,
    path,
    diagnostics,
  );

  if (
    id === undefined ||
    label === undefined ||
    nextNodeId === undefined ||
    diagnostics.length > diagnosticCount
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    label,
    nextNodeId,
    ...(requires === undefined ? {} : { requires }),
    ...(effects === undefined ? {} : { effects: Object.freeze(effects) }),
  });
}

function parseOptionalEndingV2(
  node: JsonObject,
  nodeIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryEndingV2 | undefined {
  if (!hasOwn(node, "ending")) {
    return undefined;
  }
  const path = `$.nodes[${String(nodeIndex)}].ending`;
  const ending = expectObject(
    node["ending"],
    path,
    "ending",
    diagnostics,
  );
  if (ending === undefined) {
    return undefined;
  }
  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(ending, ENDING_V2_FIELDS, path, diagnostics);
  const id = parseIdentifier(ending, "id", `${path}.id`, diagnostics);
  const title = parseText(
    ending,
    "title",
    `${path}.title`,
    {
      label: "Ending title",
      minimum: 1,
      maximum: 120,
      allowNarrativeWhitespace: false,
    },
    diagnostics,
  );
  const requires = parseOptionalCondition(
    ending,
    "requires",
    `${path}.requires`,
    diagnostics,
  );

  if (
    id === undefined ||
    title === undefined ||
    diagnostics.length > diagnosticCount
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    title,
    ...(requires === undefined ? {} : { requires }),
  });
}

function parseNodes(
  document: JsonObject,
  diagnostics: StoryDiagnostic[],
): StoryNodeV1[] | undefined {
  if (!hasOwn(document, "nodes")) {
    diagnostics.push(missingField("$.nodes", "nodes"));
    return undefined;
  }

  const value = document["nodes"];
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic("$.nodes", "nodes", "an array"));
    return undefined;
  }
  if (value.length < 1 || value.length > 1_000) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        "$.nodes",
        "nodes must contain between 1 and 1000 entries.",
      ),
    );
  }

  const nodes: StoryNodeV1[] = [];
  for (const [nodeIndex, input] of value.slice(0, 1_000).entries()) {
    const node = parseNode(input, nodeIndex, diagnostics);
    if (node !== undefined) {
      nodes.push(node);
    }
  }
  return nodes;
}

function parseNode(
  input: unknown,
  nodeIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryNodeV1 | undefined {
  const path = `$.nodes[${String(nodeIndex)}]`;
  const node = expectObject(input, path, "node", diagnostics);
  if (node === undefined) {
    return undefined;
  }

  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(node, NODE_FIELDS, path, diagnostics);
  const id = parseIdentifier(node, "id", `${path}.id`, diagnostics);
  const text = parseText(
    node,
    "text",
    `${path}.text`,
    {
      label: "Node text",
      minimum: 1,
      maximum: 4_000,
      allowNarrativeWhitespace: true,
    },
    diagnostics,
  );
  const choices = parseOptionalChoices(node, nodeIndex, diagnostics);
  const ending = parseOptionalEnding(node, nodeIndex, diagnostics);

  if (
    id === undefined ||
    text === undefined ||
    diagnostics.length > diagnosticCount
  ) {
    return undefined;
  }

  return Object.freeze({
    id,
    text,
    ...(choices === undefined ? {} : { choices: Object.freeze(choices) }),
    ...(ending === undefined ? {} : { ending }),
  });
}

function parseOptionalChoices(
  node: JsonObject,
  nodeIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryChoiceV1[] | undefined {
  if (!hasOwn(node, "choices")) {
    return undefined;
  }

  const path = `$.nodes[${String(nodeIndex)}].choices`;
  const value = node["choices"];
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic(path, "choices", "an array"));
    return undefined;
  }
  if (value.length < 1 || value.length > 32) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        path,
        "choices must contain between 1 and 32 entries when present.",
      ),
    );
  }

  const choices: StoryChoiceV1[] = [];
  for (const [choiceIndex, input] of value.slice(0, 32).entries()) {
    const choice = parseChoice(input, nodeIndex, choiceIndex, diagnostics);
    if (choice !== undefined) {
      choices.push(choice);
    }
  }
  return choices;
}

function parseChoice(
  input: unknown,
  nodeIndex: number,
  choiceIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryChoiceV1 | undefined {
  const path = `$.nodes[${String(nodeIndex)}].choices[${String(choiceIndex)}]`;
  const choice = expectObject(input, path, "choice", diagnostics);
  if (choice === undefined) {
    return undefined;
  }

  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(choice, CHOICE_FIELDS, path, diagnostics);
  const id = parseIdentifier(choice, "id", `${path}.id`, diagnostics);
  const label = parseText(
    choice,
    "label",
    `${path}.label`,
    {
      label: "Choice label",
      minimum: 1,
      maximum: 160,
      allowNarrativeWhitespace: false,
    },
    diagnostics,
  );
  const nextNodeId = parseIdentifier(
    choice,
    "nextNodeId",
    `${path}.nextNodeId`,
    diagnostics,
  );

  if (
    id === undefined ||
    label === undefined ||
    nextNodeId === undefined ||
    diagnostics.length > diagnosticCount
  ) {
    return undefined;
  }

  return Object.freeze({ id, label, nextNodeId });
}

function parseOptionalEnding(
  node: JsonObject,
  nodeIndex: number,
  diagnostics: StoryDiagnostic[],
): StoryEndingV1 | undefined {
  if (!hasOwn(node, "ending")) {
    return undefined;
  }

  const path = `$.nodes[${String(nodeIndex)}].ending`;
  const ending = expectObject(node["ending"], path, "ending", diagnostics);
  if (ending === undefined) {
    return undefined;
  }

  const diagnosticCount = diagnostics.length;
  rejectUnknownFields(ending, ENDING_FIELDS, path, diagnostics);
  const id = parseIdentifier(ending, "id", `${path}.id`, diagnostics);
  const title = parseText(
    ending,
    "title",
    `${path}.title`,
    {
      label: "Ending title",
      minimum: 1,
      maximum: 120,
      allowNarrativeWhitespace: false,
    },
    diagnostics,
  );

  if (
    id === undefined ||
    title === undefined ||
    diagnostics.length > diagnosticCount
  ) {
    return undefined;
  }

  return Object.freeze({ id, title });
}

function parseOptionalCondition(
  object: JsonObject,
  field: string,
  path: string,
  diagnostics: StoryDiagnostic[],
): StoryConditionV2 | undefined {
  if (!hasOwn(object, field)) {
    return undefined;
  }
  return parseCondition(
    object[field],
    path,
    diagnostics,
    1,
    { count: 0, limitReported: false },
  );
}

function parseCondition(
  input: unknown,
  path: string,
  diagnostics: StoryDiagnostic[],
  depth: number,
  budget: { count: number; limitReported: boolean },
): StoryConditionV2 | undefined {
  if (depth > MAX_CONDITION_DEPTH) {
    diagnostics.push(
      createDiagnostic(
        "condition-limit-exceeded",
        "error",
        path,
        `Condition depth must not exceed ${String(MAX_CONDITION_DEPTH)}.`,
      ),
    );
    return undefined;
  }
  if (budget.count >= MAX_CONDITION_COUNT) {
    if (!budget.limitReported) {
      diagnostics.push(
        createDiagnostic(
          "condition-limit-exceeded",
          "error",
          path,
          `A requirement must contain at most ${String(MAX_CONDITION_COUNT)} conditions.`,
        ),
      );
      budget.limitReported = true;
    }
    return undefined;
  }
  budget.count += 1;

  const condition = expectObject(
    input,
    path,
    "condition",
    diagnostics,
  );
  if (condition === undefined) {
    return undefined;
  }
  const type = condition["type"];
  if (type === "flag-equals") {
    rejectUnknownFields(
      condition,
      ["type", "flag", "value"],
      path,
      diagnostics,
    );
    const flag = parseIdentifier(
      condition,
      "flag",
      `${path}.flag`,
      diagnostics,
    );
    if (!hasOwn(condition, "value")) {
      diagnostics.push(missingField(`${path}.value`, "value"));
      return undefined;
    }
    const value = parseFlagValue(
      condition["value"],
      `${path}.value`,
      diagnostics,
    );
    return flag === undefined || value === undefined
      ? undefined
      : Object.freeze({ type, flag, value });
  }
  if (type === "has-item") {
    rejectUnknownFields(
      condition,
      ["type", "item"],
      path,
      diagnostics,
    );
    const item = parseIdentifier(
      condition,
      "item",
      `${path}.item`,
      diagnostics,
    );
    return item === undefined
      ? undefined
      : Object.freeze({ type, item });
  }
  if (type === "not") {
    rejectUnknownFields(
      condition,
      ["type", "condition"],
      path,
      diagnostics,
    );
    if (!hasOwn(condition, "condition")) {
      diagnostics.push(
        missingField(`${path}.condition`, "condition"),
      );
      return undefined;
    }
    const nested = parseCondition(
      condition["condition"],
      `${path}.condition`,
      diagnostics,
      depth + 1,
      budget,
    );
    return nested === undefined
      ? undefined
      : Object.freeze({ type, condition: nested });
  }
  if (type === "all" || type === "any") {
    rejectUnknownFields(
      condition,
      ["type", "conditions"],
      path,
      diagnostics,
    );
    const conditionsInput = condition["conditions"];
    if (!Array.isArray(conditionsInput)) {
      diagnostics.push(
        typeDiagnostic(
          `${path}.conditions`,
          "conditions",
          "an array",
        ),
      );
      return undefined;
    }
    if (conditionsInput.length < 1) {
      diagnostics.push(
        createDiagnostic(
          "invalid-condition",
          "error",
          `${path}.conditions`,
          "all and any conditions must contain at least one condition.",
        ),
      );
      return undefined;
    }
    const nested: StoryConditionV2[] = [];
    for (const [index, value] of conditionsInput.entries()) {
      if (budget.limitReported) {
        break;
      }
      const parsed = parseCondition(
        value,
        `${path}.conditions[${String(index)}]`,
        diagnostics,
        depth + 1,
        budget,
      );
      if (parsed !== undefined) {
        nested.push(parsed);
      }
    }
    return nested.length !== conditionsInput.length
      ? undefined
      : Object.freeze({ type, conditions: Object.freeze(nested) });
  }

  diagnostics.push(
    createDiagnostic(
      "invalid-condition",
      "error",
      `${path}.type`,
      typeof type === "string"
        ? `Unsupported condition type "${type}".`
        : "Condition type must be a supported string.",
    ),
  );
  return undefined;
}

function parseOptionalEffects(
  choice: JsonObject,
  choicePathValue: string,
  diagnostics: StoryDiagnostic[],
): StoryEffectV2[] | undefined {
  if (!hasOwn(choice, "effects")) {
    return undefined;
  }
  const path = `${choicePathValue}.effects`;
  const input = choice["effects"];
  if (!Array.isArray(input)) {
    diagnostics.push(typeDiagnostic(path, "effects", "an array"));
    return undefined;
  }
  if (input.length < 1 || input.length > MAX_EFFECT_COUNT) {
    diagnostics.push(
      createDiagnostic(
        "effect-limit-exceeded",
        "error",
        path,
        `effects must contain between 1 and ${String(MAX_EFFECT_COUNT)} entries.`,
      ),
    );
  }
  const effects: StoryEffectV2[] = [];
  for (const [index, value] of input.slice(0, MAX_EFFECT_COUNT).entries()) {
    const effect = parseEffect(
      value,
      `${path}[${String(index)}]`,
      diagnostics,
    );
    if (effect !== undefined) {
      effects.push(effect);
    }
  }
  return effects;
}

function parseEffect(
  input: unknown,
  path: string,
  diagnostics: StoryDiagnostic[],
): StoryEffectV2 | undefined {
  const effect = expectObject(input, path, "effect", diagnostics);
  if (effect === undefined) {
    return undefined;
  }
  const type = effect["type"];
  if (type === "set-flag") {
    rejectUnknownFields(
      effect,
      ["type", "flag", "value"],
      path,
      diagnostics,
    );
    const flag = parseIdentifier(
      effect,
      "flag",
      `${path}.flag`,
      diagnostics,
    );
    if (!hasOwn(effect, "value")) {
      diagnostics.push(missingField(`${path}.value`, "value"));
      return undefined;
    }
    const value = parseFlagValue(
      effect["value"],
      `${path}.value`,
      diagnostics,
    );
    return flag === undefined || value === undefined
      ? undefined
      : Object.freeze({ type, flag, value });
  }
  if (type === "add-item" || type === "remove-item") {
    rejectUnknownFields(effect, ["type", "item"], path, diagnostics);
    const item = parseIdentifier(
      effect,
      "item",
      `${path}.item`,
      diagnostics,
    );
    return item === undefined
      ? undefined
      : Object.freeze({ type, item });
  }

  diagnostics.push(
    createDiagnostic(
      "invalid-effect",
      "error",
      `${path}.type`,
      typeof type === "string"
        ? `Unsupported effect type "${type}".`
        : "Effect type must be a supported string.",
    ),
  );
  return undefined;
}

function parseFlagValue(
  value: unknown,
  path: string,
  diagnostics: StoryDiagnostic[],
): StoryFlagValue | undefined {
  if (
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  diagnostics.push(
    createDiagnostic(
      "invalid-document-structure",
      "error",
      path,
      "Flag values must be booleans, strings, or finite numbers.",
    ),
  );
  return undefined;
}

function parseIdentifier(
  object: JsonObject,
  field: string,
  path: string,
  diagnostics: StoryDiagnostic[],
): string | undefined {
  if (!hasOwn(object, field)) {
    diagnostics.push(missingField(path, field));
    return undefined;
  }

  const value = object[field];
  if (typeof value !== "string") {
    diagnostics.push(typeDiagnostic(path, field, "a string"));
    return undefined;
  }

  return validateIdentifierValue(value, path, field, diagnostics);
}

function validateIdentifierValue(
  value: unknown,
  path: string,
  field: string,
  diagnostics: StoryDiagnostic[],
): string | undefined {
  if (typeof value !== "string") {
    diagnostics.push(typeDiagnostic(path, field, "a string"));
    return undefined;
  }

  if (!IDENTIFIER_PATTERN.test(value)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-identifier",
        "error",
        path,
        `${field} must be 1-64 characters, start with a lowercase letter, and contain only lowercase ASCII letters, digits, and single internal hyphens.`,
      ),
    );
    return undefined;
  }

  return value;
}

function parseOptionalText(
  object: JsonObject,
  field: string,
  path: string,
  rules: TextRules,
  diagnostics: StoryDiagnostic[],
): string | undefined {
  if (!hasOwn(object, field)) {
    return undefined;
  }
  return validateTextValue(object[field], path, rules, diagnostics);
}

function parseText(
  object: JsonObject,
  field: string,
  path: string,
  rules: TextRules,
  diagnostics: StoryDiagnostic[],
): string | undefined {
  if (!hasOwn(object, field)) {
    diagnostics.push(missingField(path, field));
    return undefined;
  }
  return validateTextValue(object[field], path, rules, diagnostics);
}

function validateTextValue(
  value: unknown,
  path: string,
  rules: TextRules,
  diagnostics: StoryDiagnostic[],
): string | undefined {
  if (typeof value !== "string") {
    diagnostics.push(typeDiagnostic(path, rules.label, "a string"));
    return undefined;
  }

  const length = [...value].length;
  if (length < rules.minimum || length > rules.maximum) {
    const range =
      rules.minimum === 0
        ? `at most ${String(rules.maximum)}`
        : `between ${String(rules.minimum)} and ${String(rules.maximum)}`;
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        path,
        `${rules.label} must contain ${range} characters.`,
      ),
    );
    return undefined;
  }

  if (containsUnsupportedControl(value, rules.allowNarrativeWhitespace)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        path,
        `${rules.label} contains an unsupported control character.`,
      ),
    );
    return undefined;
  }

  return value;
}

function containsUnsupportedControl(
  value: string,
  allowNarrativeWhitespace: boolean,
): boolean {
  const pattern = allowNarrativeWhitespace
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u
    : /[\u0000-\u001F\u007F-\u009F]/u;
  return pattern.test(value);
}

function expectObject(
  value: unknown,
  path: string,
  label: string,
  diagnostics: StoryDiagnostic[],
): JsonObject | undefined {
  if (!isJsonObject(value)) {
    diagnostics.push(typeDiagnostic(path, label, "an object"));
    return undefined;
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  object: JsonObject,
  allowedFields: readonly string[],
  path: string,
  diagnostics: StoryDiagnostic[],
): void {
  const unknownFields = Object.keys(object)
    .filter((field) => !allowedFields.includes(field))
    .sort();

  for (const field of unknownFields) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        propertyPath(path, field),
        `Unknown field "${field}".`,
      ),
    );
  }
}

function hasOwn(object: JsonObject, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function missingField(path: string, field: string): StoryDiagnostic {
  return createDiagnostic(
    "invalid-document-structure",
    "error",
    path,
    `Missing required field "${field}".`,
  );
}

function typeDiagnostic(
  path: string,
  label: string,
  expected: string,
): StoryDiagnostic {
  return createDiagnostic(
    "invalid-document-structure",
    "error",
    path,
    `${label} must be ${expected}.`,
  );
}

function propertyPath(parentPath: string, field: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(field)
    ? `${parentPath}.${field}`
    : `${parentPath}[${JSON.stringify(field)}]`;
}
