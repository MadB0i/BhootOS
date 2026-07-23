import { runCli } from "./cli-program.js";

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
});

process.exitCode = exitCode;
