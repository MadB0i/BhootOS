import { parseStoryJson } from "./parser.js";
import {
  DEFAULT_STORY_FILE_MAX_BYTES,
  type LoadStoryOptions,
  type LoadStoryResult,
  type StoryLoadErrorCode,
  type StoryLoadStage,
  type StoryReadErrorCode,
  type StoryTextReader,
} from "./loader-types.js";
import type { StoryDiagnostic } from "./diagnostics.js";

export async function loadStory(
  reader: StoryTextReader,
  source: string,
  options: LoadStoryOptions = {},
): Promise<LoadStoryResult> {
  if (isAborted(options.signal)) {
    return cancelled(source);
  }

  const maxBytes =
    options.maxBytes ?? DEFAULT_STORY_FILE_MAX_BYTES;
  if (!isPositiveSafeInteger(maxBytes)) {
    return loadFailure(
      "configuration",
      "invalid-options",
      source,
      "maxBytes must be a positive safe integer.",
    );
  }

  if (isAborted(options.signal)) {
    return cancelled(source);
  }

  const readResult = await reader.read(source, {
    maxBytes,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (!readResult.ok) {
    if (readResult.code === "read-cancelled") {
      return cancelled(readResult.sourceName);
    }
    return loadFailure(
      "read",
      "read-failed",
      readResult.sourceName,
      readResult.message,
      { readCode: readResult.code },
    );
  }

  if (isAborted(options.signal)) {
    return cancelled(readResult.sourceName);
  }
  if (readResult.byteLength > maxBytes) {
    return loadFailure(
      "read",
      "read-failed",
      readResult.sourceName,
      `Story source exceeds the ${String(maxBytes)}-byte limit.`,
      { readCode: "file-too-large" },
    );
  }

  const parsed = parseStoryJson(
    readResult.text,
    readResult.sourceName,
  );

  if (isAborted(options.signal)) {
    return cancelled(readResult.sourceName);
  }

  if (!parsed.ok) {
    const diagnostics = Object.freeze([...parsed.diagnostics]);
    const malformedJson = diagnostics.some(
      (diagnostic) => diagnostic.code === "invalid-json",
    );
    return loadFailure(
      malformedJson ? "parse" : "validation",
      malformedJson ? "invalid-json" : "invalid-story",
      readResult.sourceName,
      malformedJson
        ? "Story JSON is invalid."
        : "Story document failed validation.",
      { diagnostics },
    );
  }

  return Object.freeze({
    ok: true,
    sourceName: readResult.sourceName,
    byteLength: readResult.byteLength,
    story: parsed.story,
    diagnostics: Object.freeze([...parsed.diagnostics]),
  });
}

interface LoadFailureDetails {
  readonly readCode?: StoryReadErrorCode;
  readonly diagnostics?: readonly StoryDiagnostic[];
}

function cancelled(sourceName: string): LoadStoryResult {
  return loadFailure(
    "read",
    "cancelled",
    sourceName,
    "Story loading was cancelled.",
    { readCode: "read-cancelled" },
  );
}

function loadFailure(
  stage: StoryLoadStage,
  code: StoryLoadErrorCode,
  sourceName: string,
  message: string,
  details: LoadFailureDetails = {},
): LoadStoryResult {
  return Object.freeze({
    ok: false,
    stage,
    code,
    sourceName,
    message,
    ...(details.readCode === undefined
      ? {}
      : { readCode: details.readCode }),
    ...(details.diagnostics === undefined
      ? {}
      : { diagnostics: details.diagnostics }),
  });
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
