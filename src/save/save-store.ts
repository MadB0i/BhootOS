import { TextDecoder } from "node:util";

import { inspectStorySession } from "../engine/session.js";
import type { StorySession } from "../engine/types.js";
import type { StoryDocument } from "../story/types.js";
import {
  BUNDLED_SAVE_VERSION,
  DEFAULT_SAVE_MAX_BYTES,
  type BundledSave,
  type BundledSaveStore,
  type SaveFailureCode,
  type SaveFileSystem,
  type SaveLoadResult,
  type SaveWriteResult,
} from "./types.js";

interface SaveStoreOptions {
  readonly fileSystem: SaveFileSystem;
  readonly savePath: string;
  readonly saveDirectory: string;
  readonly createTemporaryPath: () => string;
  readonly story: StoryDocument;
  readonly maxBytes?: number;
}

export function createEmptyBundledSave(story: StoryDocument): BundledSave {
  return Object.freeze({
    saveVersion: BUNDLED_SAVE_VERSION,
    storyId: story.id,
    storySchemaVersion: story.schemaVersion,
    discoveredEndingIds: Object.freeze([]),
  });
}

export function createBundledSaveStore(
  options: SaveStoreOptions,
): BundledSaveStore {
  const maxBytes = options.maxBytes ?? DEFAULT_SAVE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Save maxBytes must be a positive safe integer.");
  }

  return Object.freeze({
    load: () => loadSave(options, maxBytes),
    write: (save: BundledSave) => writeSave(options, save, maxBytes),
  });
}

function validateSave(input: unknown, story: StoryDocument): BundledSave | string {
  if (!isPlainObject(input)) {
    return "Save root must be a JSON object.";
  }
  if (!hasOnlyKeys(input, [
    "saveVersion",
    "storyId",
    "storySchemaVersion",
    "activeSession",
    "discoveredEndingIds",
  ])) {
    return "Save contains unsupported fields.";
  }
  if (input["saveVersion"] !== BUNDLED_SAVE_VERSION) {
    return "Save version is not supported.";
  }
  if (input["storyId"] !== story.id) {
    return "Save belongs to a different story.";
  }
  if (input["storySchemaVersion"] !== story.schemaVersion) {
    return "Save story schema does not match the installed episode.";
  }

  const knownEndings = new Map(
    story.nodes.flatMap((node) =>
      node.ending === undefined ? [] : [[node.ending.id, node.ending.title] as const],
    ),
  );
  const discovered = input["discoveredEndingIds"];
  if (
    !Array.isArray(discovered) ||
    discovered.some((id) => typeof id !== "string" || !knownEndings.has(id)) ||
    new Set(discovered).size !== discovered.length
  ) {
    return "Save ending history is invalid.";
  }

  const activeInput = input["activeSession"];
  let activeSession: StorySession | undefined;
  if (activeInput !== undefined) {
    if (!isPlainObject(activeInput)) {
      return "Save active session is invalid.";
    }
    const inspected = inspectStorySession(
      story,
      activeInput as unknown as StorySession,
    );
    if (!inspected.ok || inspected.session.status !== "active") {
      return "Save active session failed integrity validation.";
    }
    activeSession = inspected.session;
  }

  return Object.freeze({
    saveVersion: BUNDLED_SAVE_VERSION,
    storyId: story.id,
    storySchemaVersion: story.schemaVersion,
    ...(activeSession === undefined ? {} : { activeSession }),
    discoveredEndingIds: Object.freeze([...discovered].sort()),
  });
}

async function loadSave(
  options: SaveStoreOptions,
  maxBytes: number,
): Promise<SaveLoadResult> {
  let fileStats: { readonly size: number; isFile(): boolean };
  try {
    fileStats = await options.fileSystem.stat(options.savePath);
  } catch (error: unknown) {
    if (fileSystemCode(error) === "ENOENT") {
      return Object.freeze({
        ok: true,
        save: createEmptyBundledSave(options.story),
        exists: false,
      });
    }
    return loadFailure("save-read-failed", "Save file could not be inspected.");
  }
  if (!fileStats.isFile()) {
    return loadFailure("save-read-failed", "Save path is not a regular file.");
  }
  if (fileStats.size > maxBytes) {
    return loadFailure(
      "save-too-large",
      `Save file exceeds the ${String(maxBytes)}-byte limit.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await options.fileSystem.readFile(options.savePath);
  } catch (error: unknown) {
    return loadFailure("save-read-failed", "Save file could not be read.");
  }

  if (bytes.byteLength > maxBytes) {
    return loadFailure(
      "save-too-large",
      `Save file exceeds the ${String(maxBytes)}-byte limit.`,
    );
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return loadFailure("save-corrupt", "Save file is not valid UTF-8.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return loadFailure("save-corrupt", "Save file is not valid JSON.");
  }
  const validated = validateSave(parsed, options.story);
  if (typeof validated === "string") {
    return loadFailure("save-corrupt", validated);
  }
  return Object.freeze({ ok: true, save: validated, exists: true });
}

async function writeSave(
  options: SaveStoreOptions,
  save: BundledSave,
  maxBytes: number,
): Promise<SaveWriteResult> {
  const validated = validateSave(save, options.story);
  if (typeof validated === "string") {
    return writeFailure("save-corrupt", validated);
  }
  const json = `${JSON.stringify(validated, null, 2)}\n`;
  if (new TextEncoder().encode(json).byteLength > maxBytes) {
    return writeFailure(
      "save-too-large",
      `Save file exceeds the ${String(maxBytes)}-byte limit.`,
    );
  }

  const temporaryPath = options.createTemporaryPath();
  let cleanupTemporary = false;
  try {
    await options.fileSystem.mkdir(options.saveDirectory, { recursive: true });
    cleanupTemporary = true;
    await options.fileSystem.writeFile(temporaryPath, json, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await options.fileSystem.rename(temporaryPath, options.savePath);
    return Object.freeze({ ok: true });
  } catch (error: unknown) {
    if (fileSystemCode(error) === "EEXIST") {
      cleanupTemporary = false;
    }
    if (cleanupTemporary) {
      try {
        await options.fileSystem.unlink(temporaryPath);
      } catch {
        // Cleanup is best-effort; the target save is never partially written.
      }
    }
    return writeFailure("save-write-failed", "Save file could not be written.");
  }
}

function loadFailure(code: SaveFailureCode, message: string): SaveLoadResult {
  return Object.freeze({ ok: false, code, message });
}

function writeFailure(code: SaveFailureCode, message: string): SaveWriteResult {
  return Object.freeze({ ok: false, code, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function fileSystemCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}
