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
assert(
  declarationSource.includes("interface StorySession"),
  "library declarations must contain StorySession",
);
assert(
  declarationSource.includes("transitionStory"),
  "library declarations must contain transitionStory",
);
assert(
  declarationSource.includes("interface LineInput"),
  "library declarations must contain LineInput",
);
assert(
  declarationSource.includes("selectChoiceFromLine"),
  "library declarations must contain selectChoiceFromLine",
);
assert(
  declarationSource.includes("requestStoryChoice"),
  "library declarations must contain requestStoryChoice",
);
assert(
  declarationSource.includes("interface StoryGameplayRenderer"),
  "library declarations must contain StoryGameplayRenderer",
);
assert(
  declarationSource.includes("interface StoryChoiceRequester"),
  "library declarations must contain StoryChoiceRequester",
);
assert(
  declarationSource.includes("RunStoryResult"),
  "library declarations must contain RunStoryResult",
);
assert(
  declarationSource.includes("runStory"),
  "library declarations must contain runStory",
);
assert(
  !declarationSource.includes("StoryViewRenderer"),
  "library declarations must not expose terminal presentation internals",
);
assert(
  !declarationSource.includes("NodeLineInput"),
  "library declarations must not expose the Node line adapter",
);
assert(
  !declarationSource.includes("createStoryGameplayDependencies"),
  "library declarations must not expose the internal gameplay adapter",
);
assert(
  !declarationSource.includes("runStoryWithEngine"),
  "library declarations must not expose the internal engine test boundary",
);

const publicApi = await import(pathToFileURL(libraryFile).href);
assert(
  JSON.stringify(Object.keys(publicApi).sort()) ===
    JSON.stringify([
      "createStorySession",
      "getStoryView",
      "parseStoryDocument",
      "parseStoryJson",
      "requestStoryChoice",
      "runStory",
      "selectChoiceFromLine",
      "transitionStory",
      "validateStoryDocument",
    ]),
  "built library must expose only the supported story and engine runtime API",
);
const parsedStory = publicApi.parseStoryJson(
  '{"schemaVersion":1,"id":"verify-story","title":"Verify","entryNodeId":"start","nodes":[{"id":"start","text":"Choose.","choices":[{"id":"finish","label":"Finish","nextNodeId":"ending"}]},{"id":"ending","text":"Done.","ending":{"id":"done","title":"Done"}}]}',
);
assert(parsedStory.ok === true, "built parseStoryJson must parse a valid story");
if (parsedStory.ok) {
  assert(
    publicApi.validateStoryDocument(parsedStory.story).ok === true,
    "built validateStoryDocument must validate a parsed story",
  );
  const created = publicApi.createStorySession(parsedStory.story);
  assert(created.ok === true, "built createStorySession must create a session");
  if (created.ok) {
    const activeView = publicApi.getStoryView(parsedStory.story, created.session);
    assert(
      activeView.ok === true && activeView.view.status === "active",
      "built getStoryView must return an active view",
    );
    if (activeView.ok && activeView.view.status === "active") {
      assert(
        activeView.view.choices.length === 1 &&
          activeView.view.choices[0]?.id === "finish" &&
          !("nextNodeId" in activeView.view.choices[0]),
        "active view must expose the choice without its target",
      );

      const selected = publicApi.selectChoiceFromLine(
        activeView.view,
        "1",
      );
      assert(
        selected.ok === true &&
          selected.choiceId === "finish" &&
          selected.choiceNumber === 1 &&
          !("nextNodeId" in selected),
        "built selectChoiceFromLine must map 1 to the player-safe choice ID",
      );

      const requested = await publicApi.requestStoryChoice(
        {
          readLine: async ({ prompt }) => {
            assert(prompt === "> ", "built requestStoryChoice must use its default prompt");
            return { status: "line", value: "1" };
          },
        },
        activeView.view,
      );
      assert(
        requested.status === "selected" &&
          requested.choiceId === "finish" &&
          requested.choiceNumber === 1,
        "built requestStoryChoice must select from an injected line input",
      );

      const selectedTransition = publicApi.transitionStory(
        parsedStory.story,
        created.session,
        {
          type: "select-choice",
          choiceId: selected.ok ? selected.choiceId : "",
        },
      );
      assert(
        selectedTransition.ok === true &&
          selectedTransition.session.status === "ended" &&
          selectedTransition.session.endingId === "done",
        "built choice selection must transition to the expected ending",
      );
    }

    const transitioned = publicApi.transitionStory(
      parsedStory.story,
      created.session,
      { type: "select-choice", choiceId: "finish" },
    );
    assert(
      transitioned.ok === true &&
        transitioned.session.status === "ended" &&
        transitioned.session.endingId === "done" &&
        transitioned.session.step === 1 &&
        transitioned.session.history.length === 1,
      "built transitionStory must reach the ending and record history",
    );

    const renderedNodeIds = [];
    const gameplay = await publicApi.runStory(
      parsedStory.story,
      {
        renderer: {
          render: async (view) => {
            renderedNodeIds.push(view.nodeId);
          },
          renderInputError: () => {
            throw new Error("built gameplay must not render an input error");
          },
          renderTransitionError: () => {
            throw new Error("built gameplay must not render a transition error");
          },
        },
        choiceRequester: {
          request: async (view) => {
            assert(
              view.choices[0]?.id === "finish" &&
                !("nextNodeId" in view.choices[0]),
              "built gameplay requester must receive a player-safe view",
            );
            return {
              status: "selected",
              choiceId: "finish",
              choiceNumber: 1,
            };
          },
        },
      },
    );
    assert(
      gameplay.status === "ended" &&
        gameplay.view.ending.id === "done" &&
        gameplay.session.step === 1 &&
        gameplay.session.history.length === 1 &&
        gameplay.session.history[0]?.choiceId === "finish",
      "built runStory must traverse a two-node story to its ending",
    );
    assert(
      JSON.stringify(renderedNodeIds) ===
        JSON.stringify(["start", "ending"]),
      "built runStory must render the active view and ending once each",
    );
  }
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

process.stdout.write("Built CLI and public API verification passed.\n");

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
