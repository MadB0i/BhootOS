import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("dist/cli.js");
const bundledStory = resolve("episodes/kaun-hai/story.json");
const temporary = mkdtempSync(join(tmpdir(), "bhootos-scenarios-"));
const dataDirectory = join(temporary, "data");
const environment = {
  ...process.env,
  LOCALAPPDATA: dataDirectory,
  XDG_DATA_HOME: dataDirectory,
};
const savePath =
  process.platform === "win32"
    ? join(dataDirectory, "BhootOS", "state.json")
    : join(dataDirectory, "bhootos", "state.json");

try {
  verifyEndingRoutes();
  verifySaveLifecycle();
  verifyCustomStoriesAndFailures();
  process.stdout.write("Built CLI scenario verification passed.\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function verifyEndingRoutes() {
  const routes = [
    ["Complaint Closed", "1\n2\n1\n1\n1\n1\n1\n1\n1\n"],
    ["Permanent Night Shift", "1\n1\n1\n1\n1\n"],
    ["Unknown Administrator", "2\n1\n2\n2\n2\n1\n"],
    ["The Fourth Bell", "3\n1\n1\n1\n"],
  ];
  for (const [title, input] of routes) {
    const played = run(
      ["play", bundledStory, "--fast", "--no-color", "--ascii"],
      input,
    );
    assert(played.status === 0, `${title} route must exit 0`);
    assert(played.stdout.includes(title), `${title} route must render its ending`);
    assert(played.stderr === "", `${title} route must not write stderr`);
  }
}

function verifySaveLifecycle() {
  const fresh = run(["play", "--fast", "--no-color", "--ascii"], "1\n");
  assert(fresh.status === 4, "partial fresh play must stop at EOF");
  const firstSave = JSON.parse(readFileSync(savePath, "utf8"));
  assert(firstSave.activeSession?.step === 1, "fresh play must autosave transition 1");

  const continued = run(
    ["continue", "--fast", "--no-color", "--ascii"],
    "2\n1\n1\n1\n1\n1\n1\n1\n",
  );
  assert(continued.status === 0, "continue must reach the saved route ending");
  assert(
    occurrenceCount(continued.stdout, "The complaint was filed") === 1,
    "continue must render the resumed current node once",
  );
  const completedSave = JSON.parse(readFileSync(savePath, "utf8"));
  assert(!("activeSession" in completedSave), "completion must clear active run");
  assert(
    completedSave.discoveredEndingIds.includes("complaint-closed"),
    "completion must record ending discovery",
  );

  const endings = run(["endings", "--no-color"]);
  assert(endings.status === 0, "endings must exit 0");
  assert(endings.stdout.includes("Complaint Closed"), "endings must show discovery");
  assert(endings.stdout.includes("???"), "endings must hide undiscovered titles");
  assert(
    !endings.stdout.includes("complaint-closed"),
    "endings must not expose internal ending IDs",
  );

  const noActive = run(["continue", "--fast", "--no-color"], "");
  assert(noActive.status === 6, "continue after completion must exit 6");

  const restarted = run(["restart", "--fast", "--no-color", "--ascii"], "");
  assert(restarted.status === 4, "restart with EOF must start and then exit 4");
  assert(restarted.stdout.includes("Kaun hai wahan?"), "restart must render entry");
  const restartedSave = JSON.parse(readFileSync(savePath, "utf8"));
  assert(restartedSave.activeSession?.step === 0, "restart must reset active state");
  assert(
    restartedSave.discoveredEndingIds.includes("complaint-closed"),
    "restart must preserve ending history",
  );

  writeFileSync(savePath, "{broken", "utf8");
  const corrupt = run(["continue", "--fast", "--no-color"], "");
  assert(corrupt.status === 7, "corrupt continue must exit 7");
  assert(corrupt.stderr.includes("not valid JSON"), "corrupt save must be reported");
  assert(readFileSync(savePath, "utf8") === "{broken", "corrupt save must remain intact");

  const recovered = run(["restart", "--fast", "--no-color"], "");
  assert(recovered.status === 4, "explicit restart must recover a corrupt save");
  assert(
    recovered.stderr.includes("Restarting with a clean ending history"),
    "corrupt recovery must not be silent",
  );
  JSON.parse(readFileSync(savePath, "utf8"));
}

function verifyCustomStoriesAndFailures() {
  const v1Path = join(temporary, "custom-v1.json");
  const v2Path = join(temporary, "custom-v2.json");
  const malformedPath = join(temporary, "malformed.json");
  const invalidUtf8Path = join(temporary, "invalid-utf8.json");
  const oversizedPath = join(temporary, "oversized.json");
  writeFileSync(
    v1Path,
    '{"schemaVersion":1,"id":"custom-v1","title":"Custom V1","entryNodeId":"start","nodes":[{"id":"start","text":"V1 start.","choices":[{"id":"finish","label":"Finish","nextNodeId":"end"}]},{"id":"end","text":"V1 end.","ending":{"id":"done","title":"V1 Done"}}]}',
    "utf8",
  );
  writeFileSync(
    v2Path,
    '{"schemaVersion":2,"id":"custom-v2","title":"Custom V2","entryNodeId":"start","initialState":{"flags":{"ready":false},"inventory":[]},"nodes":[{"id":"start","text":"V2 start.","choices":[{"id":"finish","label":"Finish","nextNodeId":"end","effects":[{"type":"set-flag","flag":"ready","value":true}]}]},{"id":"end","text":"V2 end.","ending":{"id":"done","title":"V2 Done","requires":{"type":"flag-equals","flag":"ready","value":true}}}]}',
    "utf8",
  );
  writeFileSync(malformedPath, "{", "utf8");
  writeFileSync(invalidUtf8Path, Uint8Array.from([0xff, 0xfe, 0xfd]));
  writeFileSync(oversizedPath, " ".repeat(1_048_577), "utf8");

  for (const [path, title] of [
    [v1Path, "V1 Done"],
    [v2Path, "V2 Done"],
  ]) {
    const played = run(
      ["play", path, "--fast", "--no-color", "--ascii"],
      "1\n",
      { FORCE_COLOR: "1" },
    );
    assert(played.status === 0, `${title} custom story must exit 0`);
    assert(played.stdout.includes(title), `${title} must render`);
    assert(!played.stdout.includes("\u001b["), `${title} must honor no-color`);
  }

  const validatedV2 = run(["validate", v2Path, "--no-color"]);
  assert(validatedV2.status === 0, "custom v2 validation must exit 0");
  assert(validatedV2.stdout.includes("Schema: 2"), "custom v2 schema must be reported");
  assert(run(["play", v1Path, "--fast"], "").status === 4, "custom EOF must exit 4");
  assert(run(["play", malformedPath, "--no-color"]).status === 2, "malformed story must exit 2");
  assert(
    run(["play", invalidUtf8Path, "--no-color"]).status === 2,
    "invalid UTF-8 story must exit 2",
  );
  assert(run(["play", oversizedPath, "--no-color"]).status === 2, "oversized story must exit 2");

  const reduced = run(
    ["play", v1Path, "--reduced-motion", "--no-color", "--ascii"],
    "1\n",
  );
  assert(reduced.status === 0, "reduced-motion story must exit 0");
  assert(!reduced.stdout.includes("\u001b["), "ASCII no-color mode must contain no ANSI");
}

function run(args, input = "", extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...environment, ...extraEnvironment },
    input,
    cwd: temporary,
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

function occurrenceCount(text, value) {
  return text.split(value).length - 1;
}
