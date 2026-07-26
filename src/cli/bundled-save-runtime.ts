import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Readable, Writable } from "node:stream";

import { createStorySession, type StorySession } from "../engine/index.js";
import {
  createBundledSaveStore,
  createEmptyBundledSave,
} from "../save/save-store.js";
import type {
  BundledSave,
  SaveFileSystem,
} from "../save/types.js";
import { loadStory } from "../story/load-story.js";
import { createNodeStoryFileReader } from "../story/node-file-reader.js";
import type { StoryDocument } from "../story/types.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import {
  runProductionPlayCommand,
  type ProductionPlayCommandOptions,
} from "./play-runtime.js";

export type BundledCommand = "play" | "continue" | "restart" | "endings";

export interface BundledCommandOptions {
  readonly storyFile: string;
  readonly saveFile: string;
  readonly input: Readable;
  readonly output: Writable;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly capabilities: TerminalCapabilities;
  readonly fast: boolean;
  readonly signal?: AbortSignal;
  readonly interrupt?: () => void;
  readonly columns?: number;
}

export const BUNDLED_COMMAND_EXIT_CODES = Object.freeze({
  ok: 0,
  storyLoadFailure: 2,
  noActiveSave: 6,
  saveFailure: 7,
  sessionCreationFailure: 5,
} as const);

const NODE_SAVE_FILE_SYSTEM: SaveFileSystem = Object.freeze({
  stat,
  readFile,
  mkdir,
  writeFile,
  rename,
  unlink,
});

export async function runBundledCommand(
  command: BundledCommand,
  options: BundledCommandOptions,
  fileSystem: SaveFileSystem = NODE_SAVE_FILE_SYSTEM,
): Promise<number> {
  const reader = createNodeStoryFileReader();
  const loaded = await loadStory(
    reader,
    options.storyFile,
    options.signal === undefined ? {} : { signal: options.signal },
  );
  if (!loaded.ok) {
    return runProductionPlayCommand(options.storyFile, {
      ...playOptions(options),
      bundledEpisode: true,
    });
  }

  const saveDirectory = dirname(options.saveFile);
  const store = createBundledSaveStore({
    fileSystem,
    savePath: options.saveFile,
    saveDirectory,
    story: loaded.story,
    createTemporaryPath: () =>
      join(saveDirectory, `.state-${randomUUID()}.tmp`),
  });
  const loadedSave = await store.load();

  if (command === "restart" && !loadedSave.ok) {
    options.stderr(
      `bhootos: ${loadedSave.message} Restarting with a clean ending history.\n`,
    );
  } else if (!loadedSave.ok) {
    options.stderr(`bhootos: ${loadedSave.message}\n`);
    return BUNDLED_COMMAND_EXIT_CODES.saveFailure;
  }

  const previousSave = loadedSave.ok
    ? loadedSave.save
    : createEmptyBundledSave(loaded.story);
  if (command === "endings") {
    renderEndings(loaded.story, previousSave, options.stdout);
    return BUNDLED_COMMAND_EXIT_CODES.ok;
  }

  let initialSession: StorySession;
  if (command === "continue") {
    if (previousSave.activeSession === undefined) {
      options.stderr(
        "bhootos: No active Kaun Hai? save. Start with `bhootos play`.\n",
      );
      return BUNDLED_COMMAND_EXIT_CODES.noActiveSave;
    }
    initialSession = previousSave.activeSession;
  } else {
    const created = createStorySession(loaded.story);
    if (!created.ok) {
      options.stderr("bhootos: Bundled episode session could not be created.\n");
      return BUNDLED_COMMAND_EXIT_CODES.sessionCreationFailure;
    }
    initialSession = created.session;
    const reset = await store.write(withActiveSession(previousSave, initialSession));
    if (!reset.ok) {
      options.stderr(`bhootos: ${reset.message}\n`);
      return BUNDLED_COMMAND_EXIT_CODES.saveFailure;
    }
  }

  let currentSave = previousSave;
  if (command !== "continue") {
    currentSave = withActiveSession(previousSave, initialSession);
  }
  const onTransition = async (session: StorySession): Promise<void> => {
    currentSave =
      session.status === "ended"
        ? withDiscoveredEnding(currentSave, session.endingId)
        : withActiveSession(currentSave, session);
    const written = await store.write(currentSave);
    if (!written.ok) {
      throw new Error(written.message);
    }
  };

  return runProductionPlayCommand(options.storyFile, {
    ...playOptions(options),
    bundledEpisode: true,
    initialSession,
    onTransition,
  });
}

function playOptions(
  options: BundledCommandOptions,
): ProductionPlayCommandOptions {
  return {
    input: options.input,
    output: options.output,
    stdout: options.stdout,
    stderr: options.stderr,
    capabilities: options.capabilities,
    fast: options.fast,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.interrupt === undefined ? {} : { interrupt: options.interrupt }),
    ...(options.columns === undefined ? {} : { columns: options.columns }),
  };
}

function withActiveSession(
  save: BundledSave,
  activeSession: StorySession,
): BundledSave {
  return Object.freeze({
    saveVersion: save.saveVersion,
    storyId: save.storyId,
    storySchemaVersion: save.storySchemaVersion,
    activeSession,
    discoveredEndingIds: save.discoveredEndingIds,
  });
}

function withDiscoveredEnding(
  save: BundledSave,
  endingId: string | undefined,
): BundledSave {
  if (endingId === undefined) {
    throw new Error("Completed session is missing its ending.");
  }
  return Object.freeze({
    saveVersion: save.saveVersion,
    storyId: save.storyId,
    storySchemaVersion: save.storySchemaVersion,
    discoveredEndingIds: Object.freeze(
      [...new Set([...save.discoveredEndingIds, endingId])].sort(),
    ),
  });
}

function renderEndings(
  story: StoryDocument,
  save: BundledSave,
  write: (text: string) => void,
): void {
  const discovered = new Set(save.discoveredEndingIds);
  const endingTitles = story.nodes.flatMap((node) =>
    node.ending === undefined
      ? []
      : [discovered.has(node.ending.id) ? node.ending.title : "???"],
  );
  write(
    `Kaun Hai? endings\n\n${endingTitles
      .map((title, index) => `${String(index + 1)}. ${title}`)
      .join("\n")}\n`,
  );
}
