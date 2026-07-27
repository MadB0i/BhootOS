import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validatePackageFiles } from "./package-files.mjs";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? (process.env["ComSpec"] ?? "cmd.exe") : "npm";
const npmArguments = isWindows
  ? ["/d", "/s", "/c", "npm.cmd pack --dry-run --json --ignore-scripts"]
  : ["pack", "--dry-run", "--json", "--ignore-scripts"];
const result = spawnSync(
  npmCommand,
  npmArguments,
  {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(tmpdir(), "bhootos-npm-cache"),
    },
  },
);

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.stdout) {
    process.stderr.write(result.stdout);
  }
  throw new Error(
    result.error?.message ?? `npm pack --dry-run exited ${String(result.status)}`,
  );
}

const packResults = JSON.parse(result.stdout);
const files = packResults[0]?.files?.map(({ path }) => path).sort();
validatePackageFiles(files);

process.stdout.write(`Package dry run verified ${String(files.length)} files.\n`);
