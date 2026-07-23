# BhootOS

BhootOS is the terminal foundation for a planned interactive-fiction runtime
disguised as a haunted operating system.

The current release provides:

- deterministic terminal capability detection
- Unicode and ASCII boot rendering
- color, reduced-motion and fast-output controls
- cancellable typewriter timing
- a `doctor` command for inspecting terminal behavior
- a versioned Story Document v1 JSON format
- deterministic static story-graph validation
- an importable TypeScript story API with declarations
- a validated minimal example story

It does not yet include an interactive story runtime, terminal story rendering,
story controls, inventory, saves or the planned **Kaun Hai?** episode.

## Requirements

- Node.js 20 or newer
- pnpm 9.15.4, pinned through `packageManager`

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` typechecks source and tests, runs the test suite, builds the CLI and
library, executes built-artifact smoke tests and inspects the package dry run.

## CLI

```bash
bhootos --fast --no-color --ascii
bhootos doctor
bhootos doctor --no-color --ascii
```

Global options may appear before or after `doctor`.

## Story Document API

```ts
import {
  parseStoryJson,
  validateStoryDocument,
  type StoryDocumentV1,
} from "bhootos";
```

The API parses unknown data without throwing for expected validation failures,
returns path-aware diagnostics, and validates references and reachability in a
Story Document v1 graph. See
[`docs/story-format-v1.md`](docs/story-format-v1.md) for the field reference and
[`examples/minimal-story.json`](examples/minimal-story.json) for a valid minimal
document.

This release defines and validates stories only. Gameplay and the built-in
episode remain future work.

## License

MIT
