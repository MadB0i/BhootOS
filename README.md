# BhootOS

> A haunted terminal runtime for interactive horror stories.

<!--
Demo slot: replace the terminal excerpt below with the reviewed demo GIF after
recording it with docs/demo-recording.md. No demo asset is committed yet.
-->

```text
BHOOT/OS
Haunted Terminal Runtime

Human processes detected: 1
Unknown processes detected: 2

Kaun hai wahan?

  1. Open complaint 108
  2. Check the paper register
  3. Go to the locked corridor
```

**One-command launch after the pending npm release:**

```bash
npx bhootos
```

Play the bundled Indian horror-comedy **Kaun Hai?**, or write a branching
terminal story without changing the engine. BhootOS requires Node.js 20 or
newer; its CI matrix covers Windows and Ubuntu on Node.js 20 and 24.

## What is BhootOS?

BhootOS is both a playable terminal story and a reusable TypeScript narrative
runtime. It ships with **Kaun Hai?**, a complete four-ending episode set in the
administrative office of an old temple trust on a monsoon night.

Stories are versioned JSON documents. The parser and validator check their
structure and graph before play; the engine then exposes visible choices,
applies state changes in order, and records immutable history. Authors work in
story files rather than editing engine source.

## Why it is different

- **A real episode, not a sample scene.** `Kaun Hai?` has 23 nodes, four
  distinct endings, persistent progress, and ending discovery.
- **Versioned story contracts.** Story Document v1 keeps static stories simple;
  v2 adds declared flags, inventory, conditions, effects, and ending gates.
- **Validation before improvisation.** Deterministic diagnostics catch broken
  references, unreachable content, invalid state operations, and active nodes
  with no path to an ending before the first prompt.
- **State you can inspect.** Sessions are immutable and replay-validated, so
  forged history or corrupted saves are rejected instead of trusted.
- **Release discipline.** Strict TypeScript, cross-platform CI, built-package
  boundary checks, scenario tests, and installed-tarball verification are part
  of the release candidate.

## Play

The intended public launch is deliberately short:

```bash
npx bhootos
```

The npm package has not been published yet. From a source checkout, the same
bundled run is available now:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js --fast
```

Once installed, the main player flow is:

```bash
npx bhootos
npx bhootos play
npx bhootos play ./my-story/story.json
npx bhootos continue
npx bhootos restart
npx bhootos endings
```

- `bhootos` adds a brief BhootOS introduction, then starts a fresh bundled run.
- `play` starts the bundled episode, or plays the supplied v1/v2 story file.
- `continue` resumes the active bundled save.
- `restart` replaces the active bundled run while preserving valid discovered
  endings.
- `endings` shows discovered ending titles and hides the rest.

Bundled play autosaves after each successful choice. Custom story files are not
autosaved in this release.

## Meet *Kaun Hai?*

At 2:13 a.m., a monsoon power cut leaves a repair technician alone in an old
temple-trust office. A dead complaint terminal switches itself on and reopens a
case from 1998—one closed without an investigation.

The trail runs through a falsified bureaucratic record, damp paper, and a
question the office never answered. Its four endings balance quiet horror with
dry administrative comedy. The wrongdoing belongs to the office and its
records; the temple, faith, and worshippers are treated respectfully.

## Build your own story

Story Document v2 keeps narrative and state in readable JSON. This small
example has one flag, one inventory item, one condition, one effect, and one
ending:

```json
{
  "schemaVersion": 2,
  "id": "haunted-station",
  "title": "Haunted Station",
  "entryNodeId": "platform",
  "initialState": {
    "flags": {
      "signal-lit": false
    },
    "inventory": ["brass-key"]
  },
  "nodes": [
    {
      "id": "platform",
      "text": "The last signal box is still locked.",
      "choices": [
        {
          "id": "open-signal-box",
          "label": "Use the brass key",
          "nextNodeId": "control-room",
          "requires": {
            "type": "has-item",
            "item": "brass-key"
          },
          "effects": [
            {
              "type": "set-flag",
              "flag": "signal-lit",
              "value": true
            }
          ]
        }
      ]
    },
    {
      "id": "control-room",
      "text": "A red signal wakes beyond the empty platform.",
      "ending": {
        "id": "last-train",
        "title": "The Last Train"
      }
    }
  ]
}
```

Create, validate, and play a starter project:

```bash
bhootos create-story haunted-station
bhootos validate ./haunted-station/story.json
bhootos play ./haunted-station/story.json
```

Start with the [story-authoring guide](docs/story-authoring.md) and
[Story Document v2 reference](docs/story-format-v2.md). Static stories can
continue to use the supported [v1 format](docs/story-format-v1.md).

## Features

### For players

- Bundled four-ending episode with autosave, continue, restart, and ending
  discovery
- Numbered choices with no hidden internal IDs
- Color-free, ASCII, reduced-motion, and fast output modes
- Local save validation and explicit recovery behavior

### For authors

- Story Document v1 and v2
- Source-aware structural, graph, and state diagnostics
- Flags, inventory, nested conditions, and ordered atomic effects
- Starter generation and standalone validation commands

### For developers

- Strict TypeScript with exact optional properties
- Immutable deterministic engine and player-safe views
- Platform-neutral ESM library API
- Built-CLI, scenario, package-content, and installed-tarball checks
- Windows/Ubuntu CI matrix and a tag-only npm provenance workflow

## CLI reference

| Command | Purpose |
| --- | --- |
| `bhootos` | Show the brief brand intro and start a fresh bundled run. |
| `bhootos play [story-file]` | Play `Kaun Hai?` or one explicit v1/v2 file. |
| `bhootos continue` | Resume the active bundled save. |
| `bhootos restart` | Restart bundled play while retaining valid ending history. |
| `bhootos endings` | List discovered ending titles and hidden slots. |
| `bhootos validate <story-file>` | Parse and validate without playing or writing. |
| `bhootos create-story <name>` | Create a minimal Story Document v2 project. |
| `bhootos doctor` | Report detected terminal capabilities. |
| `bhootos intro` | Show the full BhootOS boot sequence. |

Global options may appear before or after a command:

```text
--no-color
--ascii
--reduced-motion
--fast
```

See the [full CLI reference](docs/cli-reference.md) for exit codes and command
behavior.

## Architecture

```text
Story JSON
    |
Reader boundary -> Parser + Validator -> Frozen Story
                                           |
                                 Immutable Session Engine
                                           |
                                  Gameplay Orchestrator
                                      /           \
                               Renderer         Choice Input
                                      \           /
                                  Node CLI + Local Saves
```

Parsing, validation, sessions, views, transitions, numbered input, and gameplay
orchestration form the platform-neutral library. Node file access, process
signals, terminal streams, bundled content, and saves stay behind the CLI
boundary.

Stories are data only: no story field is evaluated as JavaScript or dispatched
as a shell command. The full boundary design is documented in
[Architecture](docs/architecture.md); engine and orchestration contracts live
in the [engine API](docs/engine-api.md) and
[gameplay API](docs/gameplay-api.md).

## Library API

The package root exposes the story and engine contracts without exporting
terminal or save internals:

```ts
import {
  createStorySession,
  getStoryView,
  parseStoryJson,
  transitionStory,
} from "bhootos";

export function chooseFirstVisibleOption(json: string) {
  const parsed = parseStoryJson(json, "story.json");
  if (!parsed.ok) throw new Error("Story validation failed.");

  const created = createStorySession(parsed.story);
  if (!created.ok) throw new Error("Session creation failed.");

  const viewed = getStoryView(parsed.story, created.session);
  if (!viewed.ok || viewed.view.status !== "active") {
    throw new Error("Expected an active story view.");
  }

  const choice = viewed.view.choices[0];
  if (choice === undefined) throw new Error("No visible choice.");

  const next = transitionStory(parsed.story, created.session, {
    type: "select-choice",
    choiceId: choice.id,
  });

  if (!next.ok) throw new Error(next.message);
  return next.view;
}
```

For a complete injected renderer/requester loop, see the
[gameplay API guide](docs/gameplay-api.md).

## Accessibility and terminal support

- `--no-color` removes ANSI color, including when color is otherwise forced.
- `--ascii` replaces Unicode borders and markers with plain ASCII.
- `--reduced-motion` disables narrative animation for accessibility.
- `--fast` disables animation for testing, recording, and quick replay.
- Non-TTY output uses the same line protocol without screen clearing or raw
  terminal mode; color is disabled unless explicitly forced.
- During interactive animation, Enter or Space reveals the remaining text
  without selecting a choice.
- `Ctrl+C` requests cancellation, restores temporary terminal state, and exits
  with code 130.

Behavior varies with terminal capabilities; BhootOS does not claim identical
rendering in every terminal emulator. Presentation details are in
[Story presentation](docs/story-presentation.md).

## Security and privacy

BhootOS runs locally after installation. It makes no runtime network requests,
collects no telemetry, and stores no secrets. Story and save files are JSON
data; they cannot load modules or execute shell commands.

Bundled saves remain in the platform user-data directory. Story reads are
limited to 1 MiB, save reads to 256 KiB, and both pass strict UTF-8, schema, and
session checks. See the [save format](docs/save-format.md) and
[security policy](SECURITY.md) for the exact boundaries and reporting process.

## Development

Use Node.js 20 or newer and the pinned pnpm 9.15.4:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

Focused commands:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

`check` typechecks, runs the test suite, builds the CLI and public library,
smoke-tests distribution boundaries and bundled scenarios, and inspects the
exact npm package contents.

## Verification

The current release candidate passes **479 automated tests across 35 test
files**. Release verification also exercises the built CLI, all four bundled
ending routes, save recovery, v1/v2 custom stories, installed-tarball imports
and commands, and the exact package allowlist.

The repository keeps the broader process visible in the
[changelog](CHANGELOG.md), [contribution guide](CONTRIBUTING.md), and
[demo-recording instructions](docs/demo-recording.md).

## Project status

BhootOS is a release candidate. Its local hostile audit and release checks
pass; the configured GitHub Actions matrix still needs a successful remote run
for the final candidate commit.

The `bhootos` package is not currently available on the public npm registry.
Version `0.1.0` publication and npm provenance remain pending, so the source
checkout instructions above are the working installation path today.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing engine, CLI, or story
changes. Report security issues through the process in
[SECURITY.md](SECURITY.md).

BhootOS is released under the [MIT License](LICENSE).
