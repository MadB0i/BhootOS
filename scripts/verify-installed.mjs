import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const temporary = mkdtempSync(join(tmpdir(), "bhootos installed-"));
const packageDirectory = join(temporary, "project");
const unrelatedDirectory = join(temporary, "elsewhere");

try {
  const packed = runNpm(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    root,
  );
  assert(packed.status === 0, `npm pack failed: ${packed.stderr}`);
  const tarballName = JSON.parse(packed.stdout)[0]?.filename;
  assert(typeof tarballName === "string", "npm pack did not report a tarball");
  const tarball = join(temporary, tarballName);

  mkdirSync(packageDirectory, { recursive: true });
  mkdirSync(unrelatedDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, "package.json"),
    '{"name":"installed-smoke","private":true,"type":"module"}\n',
    "utf8",
  );
  const installed = runNpm(
    ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"],
    packageDirectory,
  );
  assert(installed.status === 0, `tarball install failed: ${installed.stderr}`);

  const installedRoot = join(packageDirectory, "node_modules", "bhootos");
  const cli = join(installedRoot, "dist", "cli.js");
  const customV1 = join(unrelatedDirectory, "custom-v1.json");
  const customV2 = join(unrelatedDirectory, "custom-v2.json");
  writeFileSync(
    customV1,
    '{"schemaVersion":1,"id":"installed-custom","title":"Installed Custom","entryNodeId":"start","nodes":[{"id":"start","text":"Installed start.","choices":[{"id":"finish","label":"Finish","nextNodeId":"end"}]},{"id":"end","text":"Installed end.","ending":{"id":"done","title":"Installed Done"}}]}',
    "utf8",
  );
  writeFileSync(
    customV2,
    '{"schemaVersion":2,"id":"installed-v2","title":"Installed V2","entryNodeId":"start","initialState":{"flags":{"ready":false},"inventory":[]},"nodes":[{"id":"start","text":"Installed v2 start.","choices":[{"id":"finish","label":"Finish","nextNodeId":"end","effects":[{"type":"set-flag","flag":"ready","value":true}]}]},{"id":"end","text":"Installed v2 end.","ending":{"id":"done","title":"Installed V2 Done","requires":{"type":"flag-equals","flag":"ready","value":true}}}]}',
    "utf8",
  );
  const env = {
    ...process.env,
    LOCALAPPDATA: join(temporary, "data"),
    XDG_DATA_HOME: join(temporary, "data"),
  };
  const rootCommand = runCli(
    [],
    "1\n2\n1\n1\n1\n1\n1\n1\n1\n",
  );
  assert(rootCommand.status === 0, `installed root command failed: ${rootCommand.stderr}`);
  assert(
    rootCommand.stdout.includes("Complaint Closed"),
    "installed root command did not run bundled content",
  );
  const bundled = runCli(
    ["play", "--fast", "--no-color", "--ascii"],
    "1\n2\n1\n1\n1\n1\n1\n1\n1\n",
  );
  assert(bundled.status === 0, `installed bundled play failed: ${bundled.stderr}`);
  assert(
    bundled.stdout.includes("Complaint Closed"),
    "installed bundled content did not resolve package-relatively",
  );
  assert(
    !bundled.stdout.includes(installedRoot),
    "installed bundled play leaked its source path",
  );

  const npxBundled = runNpm(
    [
      "exec",
      "--",
      "bhootos",
      "play",
      "--fast",
      "--no-color",
      "--ascii",
    ],
    packageDirectory,
    {
      env,
      input: "1\n2\n1\n1\n1\n1\n1\n1\n1\n",
    },
  );
  assert(npxBundled.status === 0, `npm exec bundled play failed: ${npxBundled.stderr}`);
  assert(
    npxBundled.stdout.includes("Complaint Closed"),
    "npm exec did not launch packaged bundled content",
  );

  const intro = runCli(["intro", "--fast", "--no-color", "--ascii"]);
  assert(intro.status === 0, `installed intro failed: ${intro.stderr}`);
  assert(intro.stdout.includes("Unknown processes detected: 2"), "installed intro was incomplete");
  const doctor = runCli(["doctor", "--no-color", "--ascii"]);
  assert(doctor.status === 0, `installed doctor failed: ${doctor.stderr}`);
  assert(
    doctor.stdout.includes("BhootOS Terminal Doctor"),
    "installed doctor output is missing",
  );

  for (const [custom, schema] of [
    [customV1, "1"],
    [customV2, "2"],
  ]) {
    const validated = runCli(["validate", custom, "--no-color"]);
    assert(validated.status === 0, `installed validate failed: ${validated.stderr}`);
    assert(
      validated.stdout.includes(`Schema: ${schema}`),
      `installed validate missed custom v${schema}`,
    );
  }

  const generated = runCli(["create-story", "installed-generated"]);
  assert(generated.status === 0, `installed create-story failed: ${generated.stderr}`);
  const generatedStory = join(
    unrelatedDirectory,
    "installed-generated",
    "story.json",
  );
  const generatedValidation = runCli([
    "validate",
    generatedStory,
    "--no-color",
  ]);
  assert(
    generatedValidation.status === 0,
    `installed generated validation failed: ${generatedValidation.stderr}`,
  );
  const generatedPlay = runCli(
    ["play", generatedStory, "--fast", "--no-color", "--ascii"],
    "1\n",
  );
  assert(generatedPlay.status === 0, `installed generated play failed: ${generatedPlay.stderr}`);
  assert(
    generatedPlay.stdout.includes("Answered"),
    "installed generated story did not reach its ending",
  );

  const publicApi = await import(
    pathToFileURL(join(installedRoot, "dist", "index.js")).href
  );
  assert(typeof publicApi.parseStoryJson === "function", "installed public API is missing");
  assert(
    publicApi.parseStoryJson(readFileSync(customV1, "utf8")).ok === true,
    "installed public parser rejected the custom story",
  );
  const packageImport = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "const api=await import('bhootos');if(typeof api.runStory!=='function'||typeof api.parseStoryJson!=='function')throw new Error('missing public API');",
    ],
    { cwd: packageDirectory, env, encoding: "utf8" },
  );
  assert(packageImport.status === 0, `package-name import failed: ${packageImport.stderr}`);
  for (const excluded of ["src", "tests", "docs"]) {
    assert(!existsSync(join(installedRoot, excluded)), `${excluded} leaked into package`);
  }

  process.stdout.write("Installed tarball verification passed.\n");

  function runCli(args, input = "") {
    return spawnSync(process.execPath, [cli, ...args], {
      cwd: unrelatedDirectory,
      env,
      input,
      encoding: "utf8",
    });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function runNpm(args, cwd, options = {}) {
  const command =
    process.platform === "win32"
      ? process.execPath
      : "npm";
  const commandArguments =
    process.platform === "win32"
      ? [
          join(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js",
          ),
          ...args,
        ]
      : args;
  return spawnSync(command, commandArguments, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(temporary, "npm-cache"),
      ...(options.env ?? {}),
    },
    input: options.input,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
