import type { StoryDocumentV1 } from "./types.js";

export type StoryDiagnosticCode =
  | "invalid-json"
  | "unsupported-schema-version"
  | "invalid-document-structure"
  | "invalid-identifier"
  | "duplicate-node-id"
  | "duplicate-choice-id"
  | "duplicate-ending-id"
  | "missing-entry-node"
  | "missing-choice-target"
  | "node-without-choices-or-ending"
  | "ending-node-containing-choices"
  | "unreachable-node"
  | "unreachable-ending"
  | "no-reachable-ending"
  | "reachable-node-without-ending-path";

export type StoryDiagnosticSeverity = "error" | "warning";

export interface StoryDiagnostic {
  readonly code: StoryDiagnosticCode;
  readonly severity: StoryDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export type StoryValidationResult =
  | {
      readonly ok: true;
      readonly story: StoryDocumentV1;
      readonly diagnostics: readonly StoryDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly StoryDiagnostic[];
    };

export type StoryParseResult = StoryValidationResult;

export function createDiagnostic(
  code: StoryDiagnosticCode,
  severity: StoryDiagnosticSeverity,
  path: string,
  message: string,
): StoryDiagnostic {
  return Object.freeze({ code, severity, path, message });
}

export function failedResult(
  diagnostics: readonly StoryDiagnostic[],
): StoryValidationResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

export function completedResult(
  story: StoryDocumentV1,
  diagnostics: readonly StoryDiagnostic[],
): StoryValidationResult {
  const stableDiagnostics = Object.freeze([...diagnostics]);
  if (stableDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return Object.freeze({ ok: false, diagnostics: stableDiagnostics });
  }

  return Object.freeze({
    ok: true,
    story,
    diagnostics: stableDiagnostics,
  });
}
