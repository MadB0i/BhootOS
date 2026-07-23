import {
  createDiagnostic,
  failedResult,
  type StoryDiagnostic,
  type StoryParseResult,
} from "./diagnostics.js";
import type {
  StoryChoiceV1,
  StoryDocumentV1,
  StoryEndingV1,
  StoryNodeV1,
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
const NODE_FIELDS = ["id", "text", "choices", "ending"] as const;
const CHOICE_FIELDS = ["id", "label", "nextNodeId"] as const;
const ENDING_FIELDS = ["id", "title"] as const;

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
): StoryDocumentV1 | undefined {
  const document = expectObject(input, "$", "story document", diagnostics);
  if (document === undefined) {
    return undefined;
  }

  rejectUnknownFields(document, DOCUMENT_FIELDS, "$", diagnostics);
  const schemaVersion = parseSchemaVersion(document, diagnostics);
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
): 1 | undefined {
  if (!hasOwn(document, "schemaVersion")) {
    diagnostics.push(missingField("$.schemaVersion", "schemaVersion"));
    return undefined;
  }

  const value = document["schemaVersion"];
  if (typeof value === "number" && value !== 1) {
    diagnostics.push(
      createDiagnostic(
        "unsupported-schema-version",
        "error",
        "$.schemaVersion",
        `Schema version ${String(value)} is not supported; expected 1.`,
      ),
    );
    return undefined;
  }

  if (value !== 1) {
    diagnostics.push(
      createDiagnostic(
        "invalid-document-structure",
        "error",
        "$.schemaVersion",
        "schemaVersion must be the number 1.",
      ),
    );
    return undefined;
  }

  return 1;
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
  for (const [nodeIndex, input] of value.entries()) {
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
  for (const [choiceIndex, input] of value.entries()) {
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
