import type {
  LoadStoryOptions,
  LoadStoryResult,
} from "../story/loader-types.js";
import type { StoryDocument } from "../story/types.js";
import type { StorySession } from "../engine/types.js";
import type { RunStoryResult } from "../gameplay/types.js";

export const PLAY_EXIT_CODES = Object.freeze({
  ended: 0,
  loadFailure: 2,
  invalidAttempts: 3,
  endOfInput: 4,
  gameplayFailure: 5,
  cancelled: 130,
} as const);

export interface PlayGameplayOptions {
  readonly signal?: AbortSignal;
  readonly initialSession?: StorySession;
  readonly onTransition?: (session: StorySession) => void | Promise<void>;
}

export interface PlayCommandDependencies {
  readonly loadStoryFile: (
    sourceName: string,
    options?: LoadStoryOptions,
  ) => Promise<LoadStoryResult>;
  readonly runGameplay: (
    story: StoryDocument,
    options?: PlayGameplayOptions,
  ) => Promise<RunStoryResult>;
  readonly writeError: (text: string) => void;
}

export interface PlayCommandOptions {
  readonly signal?: AbortSignal;
  readonly bundledEpisode?: boolean;
  readonly initialSession?: StorySession;
  readonly onTransition?: (session: StorySession) => void | Promise<void>;
}

function formatLoadFailure(
  sourceName: string,
  result: Exclude<LoadStoryResult, { readonly ok: true }>,
  bundledEpisode: boolean,
): string {
  const baseMessage = result.message.replace(/\.$/, "");
  const message =
    sourceName.length === 0 || baseMessage.includes(sourceName)
      ? baseMessage
      : `${baseMessage}: ${sourceName}`;
  const diagnostics = (result.diagnostics ?? [])
    .map(
      (diagnostic) =>
        `  ${diagnostic.path} [${diagnostic.code}] ${diagnostic.message}`,
    )
    .join("\n");

  const primary =
    bundledEpisode && result.stage === "read"
      ? `Bundled episode installation could not be read: ${message}`
      : message;

  return `bhootos: ${primary}\n${diagnostics.length > 0 ? `${diagnostics}\n` : ""}`;
}

export async function executePlayCommand(
  sourceName: string,
  dependencies: PlayCommandDependencies,
  options: PlayCommandOptions = {},
): Promise<number> {
  const loadResult = await dependencies.loadStoryFile(
    sourceName,
    options.signal === undefined ? {} : { signal: options.signal },
  );

  if (!loadResult.ok) {
    if (loadResult.code === "cancelled") {
      return PLAY_EXIT_CODES.cancelled;
    }

    dependencies.writeError(
      formatLoadFailure(
        sourceName,
        loadResult,
        options.bundledEpisode === true,
      ),
    );
    return PLAY_EXIT_CODES.loadFailure;
  }

  const gameplayResult = await dependencies.runGameplay(
    loadResult.story,
    {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.initialSession === undefined
        ? {}
        : { initialSession: options.initialSession }),
      ...(options.onTransition === undefined
        ? {}
        : { onTransition: options.onTransition }),
    },
  );

  switch (gameplayResult.status) {
    case "ended":
      return PLAY_EXIT_CODES.ended;
    case "cancelled":
      return PLAY_EXIT_CODES.cancelled;
    case "eof":
      return PLAY_EXIT_CODES.endOfInput;
    case "invalid-attempt-limit":
      dependencies.writeError(
        "bhootos: Invalid choice attempt limit exhausted\n",
      );
      return PLAY_EXIT_CODES.invalidAttempts;
    case "failed":
      if (gameplayResult.code !== "transition-failed") {
        dependencies.writeError(
          `bhootos: ${gameplayResult.message.replace(/\.$/, "")}\n`,
        );
      }
      return PLAY_EXIT_CODES.gameplayFailure;
  }
}
