#!/usr/bin/env node
import { runCli } from "./cli-program.js";
import { runProductionPlayCommand } from "./cli/play-runtime.js";

declare const __BHOOTOS_VERSION__: string;

const version =
  typeof __BHOOTOS_VERSION__ === "string"
    ? __BHOOTOS_VERSION__
    : (process.env["npm_package_version"] ?? "0.0.0-dev");

const exitCode = await runCli({
  argv: process.argv,
  version,
  isTTY: process.stdout.isTTY ?? false,
  env: process.env,
  platform: process.platform,
  nodeVersion: process.version,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  playStory: (sourceName, options) =>
    runProductionPlayCommand(sourceName, {
      input: process.stdin,
      output: process.stdout,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      capabilities: options.capabilities,
      fast: options.fast,
      signal: options.signal,
    }),
  addSigintListener: (listener) => process.on("SIGINT", listener),
  removeSigintListener: (listener) => process.off("SIGINT", listener),
});

process.exitCode = exitCode;
