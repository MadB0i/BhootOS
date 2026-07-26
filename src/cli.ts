#!/usr/bin/env node
import { runCli } from "./cli-program.js";
import { homedir } from "node:os";
import {
  createStoryCommand,
  validateStoryCommand,
} from "./cli/author-runtime.js";
import { runBundledCommand } from "./cli/bundled-save-runtime.js";
import { resolveBundledEpisodePath } from "./cli/bundled-episode.js";
import { runProductionPlayCommand } from "./cli/play-runtime.js";
import { resolveBhootOsSavePath } from "./cli/save-path.js";
import { createSafeOutput } from "./cli/safe-output.js";

declare const __BHOOTOS_VERSION__: string;

const version =
  typeof __BHOOTOS_VERSION__ === "string"
    ? __BHOOTOS_VERSION__
    : (process.env["npm_package_version"] ?? "0.0.0-dev");
const bundledStoryFile = resolveBundledEpisodePath(import.meta.url);
const saveFile = resolveBhootOsSavePath({
  platform: process.platform,
  env: process.env,
  homeDirectory: homedir(),
});
const updateOutputExitCode = (code: 0 | 1): void => {
  process.exitCode = code;
};
const safeStdout = createSafeOutput(process.stdout, updateOutputExitCode);
const safeStderr = createSafeOutput(process.stderr, updateOutputExitCode);

const exitCode = await runCli({
  argv: process.argv,
  version,
  isTTY: process.stdout.isTTY ?? false,
  env: process.env,
  platform: process.platform,
  nodeVersion: process.version,
  workingDirectory: process.cwd(),
  stdout: safeStdout.write,
  stderr: safeStderr.write,
  bundledStoryFile,
  playStory: (sourceName, options) =>
    runProductionPlayCommand(sourceName, {
      input: process.stdin,
      output: process.stdout,
      stdout: safeStdout.write,
      stderr: safeStderr.write,
      capabilities: options.capabilities,
      fast: options.fast,
      bundledEpisode: options.bundledEpisode,
      signal: options.signal,
      interrupt: options.interrupt,
      columns: process.stdout.columns,
    }),
  runBundled: (command, options) =>
    runBundledCommand(command, {
      storyFile: bundledStoryFile,
      saveFile,
      input: process.stdin,
      output: process.stdout,
      stdout: safeStdout.write,
      stderr: safeStderr.write,
      capabilities: options.capabilities,
      fast: options.fast,
      signal: options.signal,
      interrupt: options.interrupt,
      columns: process.stdout.columns,
    }),
  validateStory: (sourceName) =>
    validateStoryCommand(sourceName, {
      stdout: safeStdout.write,
      stderr: safeStderr.write,
    }),
  createStory: (name, workingDirectory) =>
    createStoryCommand(name, workingDirectory, {
      stdout: safeStdout.write,
      stderr: safeStderr.write,
    }),
  addSigintListener: (listener) => process.on("SIGINT", listener),
  removeSigintListener: (listener) => process.off("SIGINT", listener),
});

process.exitCode =
  safeStdout.failure() !== undefined || safeStderr.failure() !== undefined
    ? 1
    : safeStdout.isBrokenPipe() || safeStderr.isBrokenPipe()
      ? 0
      : exitCode;
