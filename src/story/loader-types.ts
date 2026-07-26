import type { StoryDiagnostic } from "./diagnostics.js";
import type { StoryDocument } from "./types.js";

export const DEFAULT_STORY_FILE_MAX_BYTES = 1024 * 1024;

export interface StoryTextReadOptions {
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
}

export type StoryReadErrorCode =
  | "invalid-source"
  | "invalid-options"
  | "file-not-found"
  | "not-a-file"
  | "permission-denied"
  | "file-too-large"
  | "invalid-utf8"
  | "read-cancelled"
  | "read-failed";

export type StoryTextReadResult =
  | {
      readonly ok: true;
      readonly sourceName: string;
      readonly text: string;
      readonly byteLength: number;
    }
  | {
      readonly ok: false;
      readonly code: StoryReadErrorCode;
      readonly sourceName: string;
      readonly message: string;
    };

export interface StoryTextReader {
  read(
    source: string,
    options?: StoryTextReadOptions,
  ): Promise<StoryTextReadResult>;
}

export interface LoadStoryOptions {
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
}

export type StoryLoadStage =
  | "configuration"
  | "read"
  | "parse"
  | "validation";

export type StoryLoadErrorCode =
  | "invalid-options"
  | "read-failed"
  | "invalid-json"
  | "invalid-story"
  | "cancelled";

export type LoadStoryResult =
  | {
      readonly ok: true;
      readonly sourceName: string;
      readonly byteLength: number;
      readonly story: StoryDocument;
      readonly diagnostics: readonly StoryDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly stage: StoryLoadStage;
      readonly code: StoryLoadErrorCode;
      readonly sourceName: string;
      readonly message: string;
      readonly readCode?: StoryReadErrorCode;
      readonly diagnostics?: readonly StoryDiagnostic[];
    };
