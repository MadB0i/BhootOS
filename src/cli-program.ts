import { Command, CommanderError } from "commander";
import { doctorReport, runApp } from "./app.js";
import {
  detectTerminalCapabilities,
  type TerminalCapabilities,
} from "./terminal/capabilities.js";

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
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly playStory: (
    sourceName: string,
    options: {
      readonly capabilities: TerminalCapabilities;
      readonly fast: boolean;
      readonly signal: AbortSignal;
    },
  ) => Promise<number>;
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
    .description("A terminal foundation for a haunted interactive-fiction runtime.")
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
    await executeProgram(runtime, false, program.opts<CliOptions>());
  });

  program
    .command("doctor")
    .description("print a terminal capability report")
    .allowExcessArguments(false)
    .action(async (_options: Readonly<Record<string, never>>, command: Command) => {
      await executeProgram(runtime, true, command.optsWithGlobals<CliOptions>());
    });

  program
    .command("play")
    .description("play a story from an explicit JSON file")
    .argument("<story-file>", "path to a BhootOS story JSON file")
    .allowExcessArguments(false)
    .action(async (storyFile: string, _options, command: Command) => {
      const options = command.optsWithGlobals<CliOptions>();
      const capabilities = detectCapabilities(runtime, options);
      const controller = new AbortController();
      const onSigint = (): void => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };

      runtime.addSigintListener(onSigint);
      try {
        setExitCode(
          await runtime.playStory(storyFile, {
            capabilities,
            fast: options.fast === true,
            signal: controller.signal,
          }),
        );
      } finally {
        runtime.removeSigintListener(onSigint);
      }
    });

  return program;
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
