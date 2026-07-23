import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const cliPath = new URL("../dist/cli.js", import.meta.url);
const cliFile = fileURLToPath(cliPath);
const cliSource = readFileSync(cliPath, "utf8");
const libraryFile = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const declarationSource = readFileSync(
  new URL("../dist/index.d.ts", import.meta.url),
  "utf8",
);

assert(cliSource.startsWith("#!/usr/bin/env node\n"), "built CLI must start with one shebang");
assert(
  cliSource.match(/^#!/gmu)?.length === 1,
  "built CLI must contain exactly one shebang",
);
assert(
  cliSource.match(/sourceMappingURL=cli\.js\.map/g)?.length === 1,
  "built CLI must contain exactly one source-map reference",
);
assert(
  declarationSource.includes("interface StoryDocumentV1"),
  "library declarations must contain StoryDocumentV1",
);
assert(
  declarationSource.includes("parseStoryJson"),
  "library declarations must contain parseStoryJson",
);

const publicApi = await import(pathToFileURL(libraryFile).href);
assert(
  JSON.stringify(Object.keys(publicApi).sort()) ===
    JSON.stringify([
      "parseStoryDocument",
      "parseStoryJson",
      "validateStoryDocument",
    ]),
  "built library must expose only the supported runtime story API",
);
const parsedStory = publicApi.parseStoryJson(
  '{"schemaVersion":1,"id":"verify-story","title":"Verify","entryNodeId":"start","nodes":[{"id":"start","text":"Done.","ending":{"id":"done","title":"Done"}}]}',
);
assert(parsedStory.ok === true, "built parseStoryJson must parse a valid story");
if (parsedStory.ok) {
  assert(
    publicApi.validateStoryDocument(parsedStory.story).ok === true,
    "built validateStoryDocument must validate a parsed story",
  );
}

const help = run(["--help"]);
assert(help.status === 0, "--help must exit 0");
assert(help.stdout.includes("Usage: bhootos"), "--help must print usage");

const version = run(["--version"]);
assert(version.status === 0, "--version must exit 0");
assert(version.stdout.trim() === packageJson.version, "CLI version must match package.json");

const defaultRun = run(["--fast", "--no-color", "--ascii"]);
assert(defaultRun.status === 0, "default command must exit 0");
assert(defaultRun.stdout.includes("Kaun hai wahan?"), "default command must render boot text");
assert(!defaultRun.stdout.includes("\u001b["), "no-color output must contain no ANSI");

const doctor = run(["doctor", "--no-color", "--ascii"]);
assert(doctor.status === 0, "doctor must exit 0");
assert(doctor.stdout.includes("Color: no"), "doctor must report color disabled");
assert(doctor.stdout.includes("Unicode: no"), "doctor must report Unicode disabled");

const fastDoctor = run(["doctor", "--fast", "--no-color", "--ascii"]);
assert(fastDoctor.status === 0, "fast doctor must exit 0");
assert(fastDoctor.stdout === doctor.stdout, "--fast must not change doctor capabilities");

for (const args of [["--no-color", "doctor"], ["doctor", "--no-color"]]) {
  const result = run(args, { FORCE_COLOR: "1" });
  assert(result.status === 0, `${args.join(" ")} must exit 0`);
  assert(result.stdout.includes("Color: no"), `${args.join(" ")} must disable color`);
  assert(!result.stdout.includes("\u001b["), `${args.join(" ")} must contain no ANSI`);
}

for (const args of [["bogus"], ["doctor", "bogus"]]) {
  const result = run(args);
  assert(result.status !== 0, `${args.join(" ")} must reject unsupported arguments`);
}

process.stdout.write("Built CLI verification passed.\n");

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [cliFile, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
