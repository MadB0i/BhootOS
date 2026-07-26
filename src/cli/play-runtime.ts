import type { Readable, Writable } from "node:stream";

import { createStoryGameplayDependencies } from "../gameplay/adapters.js";
import { runStory } from "../gameplay/run-story.js";
import { NodeLineInput } from "../input/line-input.js";
import { createNodeAnimationSkipper } from "../input/animation-skipper.js";
import { loadStory } from "../story/load-story.js";
import { createNodeStoryFileReader } from "../story/node-file-reader.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { StorySession } from "../engine/types.js";
import { TerminalRenderer } from "../terminal/renderer.js";
import { StoryViewRenderer } from "../terminal/story-view-renderer.js";
import { executePlayCommand } from "./play-command.js";

export interface ProductionPlayCommandOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly capabilities: TerminalCapabilities;
  readonly fast: boolean;
  readonly bundledEpisode?: boolean;
  readonly initialSession?: StorySession;
  readonly onTransition?: (session: StorySession) => void | Promise<void>;
  readonly signal?: AbortSignal;
  readonly interrupt?: () => void;
  readonly columns?: number;
}

export async function runProductionPlayCommand(
  sourceName: string,
  options: ProductionPlayCommandOptions,
): Promise<number> {
  const terminalRenderer = new TerminalRenderer({
    stdout: options.stdout,
    stderr: options.stderr,
    capabilities: options.capabilities,
    fast: options.fast,
    animationSkipper: createNodeAnimationSkipper(
      options.input,
      options.interrupt ?? (() => undefined),
    ),
    ...(options.columns === undefined ? {} : { columns: options.columns }),
  });
  const viewRenderer = new StoryViewRenderer(terminalRenderer);
  const lineInput = new NodeLineInput({
    input: options.input,
    output: options.output,
  });
  const reader = createNodeStoryFileReader();
  const gameplayDependencies = createStoryGameplayDependencies(
    viewRenderer,
    lineInput,
  );

  return executePlayCommand(
    sourceName,
    {
      loadStoryFile: (candidate, loadOptions) =>
        loadStory(reader, candidate, loadOptions),
      runGameplay: (story, gameplayOptions) =>
        runStory(story, gameplayDependencies, gameplayOptions),
      writeError: options.stderr,
    },
    {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.bundledEpisode === undefined
        ? {}
        : { bundledEpisode: options.bundledEpisode }),
      ...(options.initialSession === undefined
        ? {}
        : { initialSession: options.initialSession }),
      ...(options.onTransition === undefined
        ? {}
        : { onTransition: options.onTransition }),
    },
  );
}
