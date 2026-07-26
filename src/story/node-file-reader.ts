import {
  readFile as nodeReadFile,
  stat as nodeStat,
} from "node:fs/promises";
import { TextDecoder } from "node:util";
import {
  DEFAULT_STORY_FILE_MAX_BYTES,
  type StoryReadErrorCode,
  type StoryTextReader,
  type StoryTextReadOptions,
  type StoryTextReadResult,
} from "./loader-types.js";

export interface StoryFileStats {
  readonly size: number;
  isFile(): boolean;
}

export interface NodeStoryFileSystem {
  stat(source: string): Promise<StoryFileStats>;
  readFile(
    source: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<Uint8Array>;
}

const NODE_FILE_SYSTEM: NodeStoryFileSystem = Object.freeze({
  stat: nodeStat,
  readFile: nodeReadFile,
});

export function createNodeStoryFileReader(
  fileSystem: NodeStoryFileSystem = NODE_FILE_SYSTEM,
): StoryTextReader {
  return Object.freeze({
    read: (
      source: string,
      options: StoryTextReadOptions = {},
    ): Promise<StoryTextReadResult> =>
      readStoryFile(fileSystem, source, options),
  });
}

async function readStoryFile(
  fileSystem: NodeStoryFileSystem,
  source: string,
  options: StoryTextReadOptions,
): Promise<StoryTextReadResult> {
  if (isAborted(options.signal)) {
    return readFailure(
      "read-cancelled",
      source,
      "Story file reading was cancelled.",
    );
  }
  if (typeof source !== "string" || source.trim().length === 0) {
    return readFailure(
      "invalid-source",
      source,
      "Story file path must not be empty.",
    );
  }

  const maxBytes =
    options.maxBytes ?? DEFAULT_STORY_FILE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    return readFailure(
      "invalid-options",
      source,
      "maxBytes must be a positive safe integer.",
    );
  }

  let stats: StoryFileStats;
  try {
    stats = await waitForFileSystem(
      fileSystem.stat(source),
      options.signal,
    );
  } catch (error: unknown) {
    return handleFileSystemError(error, source, options.signal);
  }

  if (isAborted(options.signal)) {
    return readFailure(
      "read-cancelled",
      source,
      "Story file reading was cancelled.",
    );
  }
  if (!stats.isFile()) {
    return readFailure(
      "not-a-file",
      source,
      `Story source is not a file: ${source}`,
    );
  }
  if (stats.size > maxBytes) {
    return tooLarge(source, maxBytes);
  }

  let bytes: Uint8Array;
  try {
    bytes = await waitForFileSystem(
      fileSystem.readFile(source, {
        ...(options.signal === undefined
          ? {}
          : { signal: options.signal }),
      }),
      options.signal,
    );
  } catch (error: unknown) {
    return handleFileSystemError(error, source, options.signal);
  }

  if (isAborted(options.signal)) {
    return readFailure(
      "read-cancelled",
      source,
      "Story file reading was cancelled.",
    );
  }
  if (bytes.byteLength > maxBytes) {
    return tooLarge(source, maxBytes);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes);
  } catch {
    return readFailure(
      "invalid-utf8",
      source,
      "Story file is not valid UTF-8.",
    );
  }

  if (isAborted(options.signal)) {
    return readFailure(
      "read-cancelled",
      source,
      "Story file reading was cancelled.",
    );
  }

  return Object.freeze({
    ok: true,
    sourceName: source,
    text,
    byteLength: bytes.byteLength,
  });
}

function waitForFileSystem<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) {
    return operation;
  }
  if (signal.aborted) {
    return Promise.reject(new StoryFileReadCancellation());
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (
      callback: (value: T) => void,
      value: T,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      fail(new StoryFileReadCancellation());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(resolve, value),
      (error: unknown) => fail(error),
    );
  });
}

function handleFileSystemError(
  error: unknown,
  source: string,
  signal: AbortSignal | undefined,
): StoryTextReadResult {
  if (
    error instanceof StoryFileReadCancellation ||
    (isAborted(signal) &&
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.name === "CancellationError"))
  ) {
    return readFailure(
      "read-cancelled",
      source,
      "Story file reading was cancelled.",
    );
  }

  const code = getFileSystemErrorCode(error);
  switch (code) {
    case "ENOENT":
    case "ENOTDIR":
      return readFailure(
        "file-not-found",
        source,
        `Story file was not found: ${source}`,
      );
    case "EACCES":
    case "EPERM":
      return readFailure(
        "permission-denied",
        source,
        `Permission was denied reading story file: ${source}`,
      );
    default:
      if (code !== undefined) {
        return readFailure(
          "read-failed",
          source,
          `Story file could not be read: ${source}`,
        );
      }
      throw error;
  }
}

function getFileSystemErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function tooLarge(
  source: string,
  maxBytes: number,
): StoryTextReadResult {
  return readFailure(
    "file-too-large",
    source,
    `Story source exceeds the ${String(maxBytes)}-byte limit.`,
  );
}

function readFailure(
  code: StoryReadErrorCode,
  sourceName: string,
  message: string,
): StoryTextReadResult {
  return Object.freeze({
    ok: false,
    code,
    sourceName,
    message,
  });
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

class StoryFileReadCancellation extends Error {
  override readonly name = "StoryFileReadCancellation";
}
