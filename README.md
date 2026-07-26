# BhootOS

A polished terminal narrative runtime disguised as a haunted operating system.

## Demo

A short terminal recording is not checked in yet. Follow
[`docs/demo-recording.md`](docs/demo-recording.md) to record the reproducible
fast-mode route without adding generated media to the npm package.

## Play

With BhootOS installed, one command starts the bundled **Kaun Hai?** episode:

```sh
bhootos
```

From this repository:

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --fast
```

The episode follows a late-night repair call in an old temple trust office,
where a complaint closed in 1998 begins asking for a truthful witness. It has
four endings, stateful evidence, autosaves, and roughly a 10–15 minute first
playthrough.

## Player commands

```text
bhootos                         Start a fresh Kaun Hai? run
bhootos play                    Start a fresh Kaun Hai? run
bhootos play <story-file>       Play one custom v1 or v2 story
bhootos continue                Resume the active bundled run
bhootos restart                 Restart it, preserving known endings
bhootos endings                 Show discovered ending titles
bhootos intro                   Show the full boot sequence
bhootos doctor                  Inspect terminal capabilities
```

Global `--no-color`, `--ascii`, `--reduced-motion`, and `--fast` options work
before or after a command. During animated text, Enter or Space reveals the
remaining text without selecting a choice. `Ctrl+C` exits cleanly with code
130.

## Story authors

```sh
bhootos create-story haunted-station
bhootos validate ./haunted-station/story.json
bhootos play ./haunted-station/story.json
```

Story Document v1 remains supported for static graphs. Version 2 adds declared
flags, inventory, pure conditions, ordered atomic effects, conditional choices,
and optional ending requirements—without scripts, evaluation, commands,
network access, or randomness. Start with
[`docs/story-authoring.md`](docs/story-authoring.md),
[`docs/story-format-v1.md`](docs/story-format-v1.md), and
[`docs/story-format-v2.md`](docs/story-format-v2.md).

## Architecture highlights

- strict, source-aware JSON parsing and deterministic graph validation;
- immutable, replay-validated sessions with version-aware history;
- a platform-neutral public library with no filesystem or process-stream
  dependency in `dist/index.js`;
- injected rendering, input, clock, story-reader, and save boundaries;
- package-relative bundled content that works outside the current directory;
- bounded UTF-8 story and save reads, atomic local saves, and no telemetry.

The public API exposes parsing, validation, loading, traversal, player-safe
views, numbered choice selection, and in-memory gameplay orchestration:

```ts
import {
  createStorySession,
  getStoryView,
  loadStory,
  parseStoryJson,
  runStory,
  transitionStory,
  validateStoryDocument,
  type StoryDocument,
  type StoryDocumentV1,
  type StoryDocumentV2,
} from "bhootos";
```

See [`docs/architecture.md`](docs/architecture.md),
[`docs/engine-api.md`](docs/engine-api.md), and
[`docs/gameplay-api.md`](docs/gameplay-api.md).

## Current limitations

- custom story files are not autosaved;
- there is one bundled episode and no remote catalog;
- validation catches deterministic structural and graph defects but is not a
  symbolic proof of every dynamic route;
- input uses numbered choices rather than arrow-key menus;
- there is no audio, network service, telemetry, or executable story scripting.

## Development

Requires Node.js 20 or newer and pnpm 9.15.4.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` typechecks source and tests, runs the complete suite, builds the
CLI and library, verifies distribution boundaries, and inspects the exact npm
package contents.

The npm tarball contains only runtime bundles, declarations, the bundled
episode, this README, the license, and package metadata.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing code or story
changes. Security reports follow [`SECURITY.md`](SECURITY.md).

## License

MIT
