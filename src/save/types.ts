import type { StorySession } from "../engine/types.js";

export const BUNDLED_SAVE_VERSION = 1 as const;
export const DEFAULT_SAVE_MAX_BYTES = 256 * 1024;

export interface BundledSave {
  readonly saveVersion: typeof BUNDLED_SAVE_VERSION;
  readonly storyId: string;
  readonly storySchemaVersion: 1 | 2;
  readonly activeSession?: StorySession;
  readonly discoveredEndingIds: readonly string[];
}

export interface SaveFileSystem {
  stat(path: string): Promise<{
    readonly size: number;
    isFile(): boolean;
  }>;
  readFile(path: string): Promise<Uint8Array>;
  mkdir(path: string, options: { readonly recursive: true }): Promise<unknown>;
  writeFile(
    path: string,
    data: string,
    options: {
      readonly encoding: "utf8";
      readonly flag: "wx";
      readonly mode: number;
    },
  ): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
}

export type SaveFailureCode =
  | "save-corrupt"
  | "save-too-large"
  | "save-read-failed"
  | "save-write-failed";

export type SaveLoadResult =
  | { readonly ok: true; readonly save: BundledSave; readonly exists: boolean }
  | { readonly ok: false; readonly code: SaveFailureCode; readonly message: string };

export type SaveWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: SaveFailureCode; readonly message: string };

export interface BundledSaveStore {
  load(): Promise<SaveLoadResult>;
  write(save: BundledSave): Promise<SaveWriteResult>;
}
