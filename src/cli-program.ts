import { Command, CommanderError } from "commander";
import { doctorReport, runApp } from "./app.js";
import {
  detectTerminalCapabilities,
  type TerminalCapabilities,
} from "./terminal/capabilities.js";
import type { BundledCommand } from "./cli/bundled-save-runtime.js";

interface CliOptions {
  readonly color: boolean;
  readonly ascii?: boolean;
  readonly reducedMotion?: boolean;
  readonly fast?: boolean;
}

export interface CliRuntime {
  readonly argv: readonly string[];
  readonly version: string;
  readonly isTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly nodeVersion: string;
  readonly workingDirectory: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly bundledStoryFile: string;
  readonly playStory: (
    sourceName: string,
    options: {
      readonly capabilities: TerminalCapabilities;
      readonly fast: boolean;
      readonly signal: AbortSignal;
      readonly bundledEpisode: boolean;
      readonly interrupt: () => void;
    },
  ) => Promise<number>;
  readonly runBundled: (
    command: BundledCommand,
    options: {
      readonly capabilities: TerminalCapabilities;
      readonly fast: boolean;
      readonly signal: AbortSignal;
      readonly interrupt: () => void;
    },
  ) => Promise<number>;
  readonly validateStory: (sourceName: string) => Promise<number>;
  readonly createStory: (name: string, workingDirectory: string) => Promise<number>;
  readonly addSigintListener: (listener: () => void) => void;
  readonly removeSigintListener: (listener: () => void) => void;
}

export async function runCli(runtime: CliRuntime): Promise<number> {
  let commandExitCode = 0;
  const program = createProgram(runtime, (exitCode) => {
    commandExitCode = exitCode;
  });

  try {
    await program.parseAsync([...runtime.argv]);
    return commandExitCode;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    if (isBrokenPipe(error)) {
      return 0;
    }

    runtime.stderr(`bhootos: ${errorMessage(error)}\n`);
    return 1;
  }
}

function createProgram(
  runtime: CliRuntime,
  setExitCode: (exitCode: number) => void,
): Command {
  const program = new Command()
    .name("bhootos")
    .description("A haunted terminal narrative runtime.")
    .version(runtime.version)
    .option("--no-color", "disable colors")
    .option("--ascii", "force ASCII-only rendering")
    .option("--reduced-motion", "disable text animation for accessibility")
    .option("--fast", "disable text animation")
    .allowExcessArguments(false)
    .configureOutput({
      writeOut: runtime.stdout,
      writeErr: runtime.stderr,
    })
    .configureHelp({ showGlobalOptions: true })
    .exitOverride();

  program.action(async () => {
    const options = program.opts<CliOptions>();
    runtime.stdout("BHOOT/OS\nHaunted Terminal Runtime\n\n");
    setExitCode(
      await executeBundledInteractive(runtime, "play", options),
    );
  });

  program
    .command("doctor")
    .description("print a terminal capability report")
    .allowExcessArguments(false)
    .action(async (_options: Readonly<Record<string, never>>, command: Command) => {
      await executeProgram(runtime, true, command.optsWithGlobals<CliOptions>());
    });

  program
    .command("intro")
    .description("show the full BhootOS boot sequence")
    .allowExcessArguments(false)
    .action(async (_options: Readonly<Record<string, never>>, command: Command) => {
      await executeProgram(runtime, false, command.optsWithGlobals<CliOptions>());
    });

  program
    .command("play")
    .description("play the bundled episode or an explicit story file")
    .argument("[story-file]", "path to a custom BhootOS story JSON file")
    .allowExcessArguments(false)
    .action(async (
      storyFile: string | undefined,
      _options,
      command: Command,
    ) => {
      const options = command.optsWithGlobals<CliOptions>();
      const capabilities = detectCapabilities(runtime, options);
      const bundledEpisode = storyFile === undefined;
      const sourceName = storyFile ?? runtime.bundledStoryFile;
      const controller = new AbortController();
      const onSigint = (): void => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };

      runtime.addSigintListener(onSigint);
      try {
        setExitCode(
          bundledEpisode
            ? await runtime.runBundled("play", {
                capabilities,
                fast: options.fast === true,
                signal: controller.signal,
                interrupt: onSigint,
              })
            : await runtime.playStory(sourceName, {
                capabilities,
                fast: options.fast === true,
                signal: controller.signal,
                bundledEpisode: false,
                interrupt: onSigint,
              }),
        );
      } finally {
        runtime.removeSigintListener(onSigint);
      }
    });

  for (const [name, description] of [
    ["continue", "resume the latest Kaun Hai? save"],
    ["restart", "clear the active save and restart Kaun Hai?"],
    ["endings", "show discovered Kaun Hai? endings"],
  ] as const) {
    program
      .command(name)
      .description(description)
      .allowExcessArguments(false)
      .action(async (_options, command: Command) => {
        const options = command.optsWithGlobals<CliOptions>();
        setExitCode(await executeBundledInteractive(runtime, name, options));
      });
  }

  program
    .command("validate")
    .description("validate a Story Document without playing it")
    .argument("<story-file>", "path to a BhootOS story JSON file")
    .allowExcessArguments(false)
    .action(async (storyFile: string) => {
      setExitCode(await runtime.validateStory(storyFile));
    });

  program
    .command("create-story")
    .description("create a minimal Story Document v2 project")
    .argument("<name>", "lowercase story project name")
    .allowExcessArguments(false)
    .action(async (name: string) => {
      setExitCode(await runtime.createStory(name, runtime.workingDirectory));
    });

  return program;
}

async function executeBundledInteractive(
  runtime: CliRuntime,
  command: BundledCommand,
  options: CliOptions,
): Promise<number> {
  const capabilities = detectCapabilities(runtime, options);
  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  runtime.addSigintListener(onSigint);
  try {
    return await runtime.runBundled(command, {
      capabilities,
      fast: options.fast === true,
      signal: controller.signal,
      interrupt: onSigint,
    });
  } finally {
    runtime.removeSigintListener(onSigint);
  }
}

async function executeProgram(
  runtime: CliRuntime,
  isDoctor: boolean,
  options: CliOptions,
): Promise<void> {
  const capabilities = detectCapabilities(runtime, options);
  const io = {
    stdout: runtime.stdout,
    stderr: runtime.stderr,
  };

  if (isDoctor) {
    doctorReport({
      io,
      capabilities,
      platform: runtime.platform,
      nodeVersion: runtime.nodeVersion,
    });
    return;
  }

  await runApp({
    io,
    capabilities,
    fast: options.fast === true,
  });
}

function detectCapabilities(
  runtime: CliRuntime,
  options: CliOptions,
): TerminalCapabilities {
  return detectTerminalCapabilities({
    isTTY: runtime.isTTY,
    env: runtime.env,
    platform: runtime.platform,
    noColor: options.color === false,
    forceAscii: options.ascii === true,
    reducedMotion: options.reducedMotion === true,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBrokenPipe(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EPIPE"
  );
}
