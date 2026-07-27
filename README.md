# BhootOS

> A haunted terminal runtime for interactive horror stories.

[![CI](https://github.com/MadB0i/BhootOS/actions/workflows/ci.yml/badge.svg)](https://github.com/MadB0i/BhootOS/actions/workflows/ci.yml)

```text
BHOOT/OS
Haunted Terminal Runtime

Human processes detected: 1
Unknown processes detected: 2

COMPLAINT 108/1998 — RESOLVED

Kaun hai wahan?

  1. Open complaint 108
  2. Check the paper register
  3. Go to the locked corridor
```

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js
```

BhootOS is not a scripted terminal mock-up: it separates a reusable narrative
engine from its CLI, then proves that boundary with a complete stateful episode.

## A runtime with a story inside

BhootOS is three things that share one deliberately small architecture:

- **A playable experience.** The bundled episode, **Kaun Hai?**, is a complete
  Indian horror-comedy with persistent progress and four distinct endings.
- **A story engine.** Versioned JSON documents define narrative, choices,
  conditions, inventory, effects, and endings without executable story code.
- **A TypeScript runtime.** Parsing, validation, immutable sessions, player-safe
  views, transitions, numbered input, and gameplay orchestration form a reusable
  platform-neutral API.

The cross-platform Node CLI supplies the edges: files, terminal streams,
signals, bundled content, and local saves. That separation is tested in the
built output, not just described in a diagram.

## Kaun Hai?

At 2:13 a.m., a monsoon power cut leaves a repair technician alone in the
administrative office of an old temple trust. An obsolete complaint terminal
switches itself on and reopens case **108/1998**.

The record connects a missing night clerk, falsified administrative entries,
a copied signature, and an inquiry that never happened. Damp paper remembers
what the database does not. A brass service bell keeps asking for a witness.
The terminal, like any determined office system, would prefer somebody to fill
the wrong field.

The story keeps its supernatural tension quiet and its comedy bureaucratic.
The temple, faith, and worshippers are treated respectfully; the wrongdoing
belongs to the office, its records, and the people who altered them.

**Kaun Hai?** contains 23 nodes and four endings. This README does not reveal
solutions, evidence combinations, or route requirements.

## Run from source

Requirements:

- Node.js 20 or newer
- Corepack
- Git

```powershell
git clone https://github.com/MadB0i/BhootOS.git
cd BhootOS
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js
```

> **Distribution status:** `bhootos` is not published on npm. The supported
> way to install and run it today is from this repository.

### Player commands

```powershell
node dist/cli.js
node dist/cli.js play
node dist/cli.js play ./path/to/story.json
node dist/cli.js continue
node dist/cli.js restart
node dist/cli.js endings
```

- No command, or `play`, starts a fresh **Kaun Hai?** run.
- `play <story-file>` runs one explicit Story Document v1 or v2 file.
- `continue` resumes the active bundled save.
- `restart` starts over while retaining valid discovered endings.
- `endings` reveals discovered titles and keeps the rest hidden.

Bundled play autosaves after every successful choice. Explicit custom story
files are deliberately not autosaved.

### Terminal controls

Global options can appear before or after a command:

```text
--no-color
--ascii
--reduced-motion
--fast
```

Enter or Space reveals the remainder of animated text without choosing an
option. `Ctrl+C` cancels cleanly, restores temporary terminal state, and exits
with code 130.

## Write a story

Create a minimal Story Document v2 project, validate it, and play it with the
same production parser and validator used by the bundled episode:

```powershell
node dist/cli.js create-story haunted-station
node dist/cli.js validate ./haunted-station/story.json
node dist/cli.js play ./haunted-station/story.json
```

Story files are plain, versioned JSON:

- **v1** describes static branching graphs and remains fully supported.
- **v2** adds declared flags, inventory, nested conditions, ordered effects,
  conditional choices, and ending requirements.

Validation reports ordered, source-aware diagnostics for malformed fields,
duplicate identifiers, broken references, unreachable content, invalid state
operations, and active nodes with no path to an ending. It never evaluates
story content as JavaScript or dispatches it as a shell command.

Start with the checked-in [minimal story](examples/minimal-story.json), then
read the [authoring guide](docs/story-authoring.md) and
[Story Document v2 reference](docs/story-format-v2.md). The
[v1 reference](docs/story-format-v1.md) documents the supported static format.

## Under the terminal

```text
Story JSON
   |
reader -> parser -> validator -> frozen story
                                |
                      session / view / transition
                                |
                    in-memory gameplay loop
                         /              \
                  renderer          choice input

CLI adapters: Node files, terminal streams, signals, bundled content, saves
```

The boundaries are intentional:

- The parser accepts unknown JSON and returns a frozen story or ordered
  diagnostics.
- The validator checks structure, references, graph reachability, ending paths,
  and bounded v2 state semantics.
- The engine exposes immutable sessions and player-safe views. Every supplied
  session is replayed from the entry state before it can be viewed or changed.
- V2 effects apply to temporary state in document order and commit atomically.
- `runStory` coordinates injected rendering and choice input without owning a
  terminal, filesystem, or process stream.
- The CLI resolves bundled content relative to its own module, not the current
  working directory.

The complete design lives in [docs/architecture.md](docs/architecture.md).

## Public TypeScript API

After a source build, the platform-neutral ESM API and its declarations are in
`dist/index.js` and `dist/index.d.ts`:

```ts
import {
  createStorySession,
  getStoryView,
  parseStoryJson,
  transitionStory,
} from "./dist/index.js";

const parsed = parseStoryJson(json, "story.json");
if (!parsed.ok) {
  throw new Error(parsed.diagnostics.map(({ message }) => message).join("\n"));
}

const created = createStorySession(parsed.story);
if (!created.ok) throw new Error(created.message);

const current = getStoryView(parsed.story, created.session);
if (!current.ok || current.view.status !== "active") {
  throw new Error("Expected an active story.");
}

const firstChoice = current.view.choices[0];
if (firstChoice === undefined) throw new Error("No visible choice.");

const next = transitionStory(parsed.story, created.session, {
  type: "select-choice",
  choiceId: firstChoice.id,
});
```

The public module also exports the loader boundary, numbered choice selection,
and the injected `runStory` orchestration API. It does not export Node file
access, terminal composition, save paths, or author-command adapters.

See the [engine API](docs/engine-api.md),
[gameplay API](docs/gameplay-api.md), and
[story-loading contract](docs/story-loading.md) for typed results and failure
behavior.

## Engineering constraints

BhootOS is intentionally strict about the unglamorous parts:

- TypeScript `strict` mode, exact optional properties, unchecked-index
  protection, and unused-code checks
- Deterministic transitions with immutable, replay-validated history
- Atomic v2 state effects and atomic bundled-save replacement
- Strict UTF-8 reads capped at 1 MiB for stories and 256 KiB for saves
- No runtime network requests, telemetry, dynamic story modules, or executable
  story scripting
- A public library bundle verified not to depend on Node filesystem or process
  streams
- Built-CLI scenarios, exact package-content inspection, and installation from
  a locally produced tarball
- Terminal behavior tested across animated, reduced-motion, ASCII, color-free,
  TTY, and non-TTY paths

## Verified baseline

The normal GitHub Actions workflow runs the complete project check on every
push to `main`, on pull requests, and on manual dispatch:

| Runner | Node 20 | Node 24 |
| --- | :---: | :---: |
| Ubuntu | passing | passing |
| Windows | passing | passing |

Current verified baseline:

- **487 tests across 36 test files**
- Typecheck passed
- Build passed
- Full `pnpm check` passed
- Built CLI and bundled scenarios passed
- Exact 11-file package inspection passed
- Installed-tarball imports and commands passed
- Full and production dependency audits report **zero known vulnerabilities**

Package inspection and tarball installation are local verification boundaries;
they do not imply registry publication.

## Honest boundaries

- There is one bundled episode and no remote story catalog.
- Custom story files do not use the bundled autosave system.
- Choices are numbered rather than presented as arrow-key menus.
- There is no audio layer, network service, executable story code, or
  randomness.
- Deterministic validation catches structural and graph defects; it does not
  pretend to be a symbolic proof of every possible stateful route.
- Presentation adapts to terminal capabilities and is not pixel-identical
  across every emulator.

These limits keep the engine inspectable and the story format safe.

## Documentation

- [CLI commands and exit codes](docs/cli-reference.md)
- [Story authoring](docs/story-authoring.md)
- [Story Document v1](docs/story-format-v1.md)
- [Story Document v2](docs/story-format-v2.md)
- [Engine API](docs/engine-api.md)
- [Gameplay API](docs/gameplay-api.md)
- [Save format](docs/save-format.md)
- [Terminal presentation](docs/story-presentation.md)

The spoiler-containing design notes for **Kaun Hai?** are kept separately in
[docs/kaun-hai-authoring-notes.md](docs/kaun-hai-authoring-notes.md).

## Development

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm check
node scripts/verify-installed.mjs
```

`pnpm check` typechecks source and tests, runs the full suite, builds the CLI and
library, verifies public distribution boundaries, exercises bundled scenarios,
and inspects the exact package contents.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing engine, CLI,
documentation, or story changes. Security reports follow
[SECURITY.md](SECURITY.md).

## License

BhootOS is open source under the [MIT License](LICENSE).
