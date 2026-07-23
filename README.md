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
- deterministic in-memory story traversal
- immutable session snapshots with traversal history
- choice selection by ID with typed failure outcomes
- an internal capability-aware terminal presenter for engine views

It does not yet include an interactive terminal gameplay loop, input
orchestration, input controls, inventory, saves or the planned **Kaun Hai?**
episode.

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
  createStorySession,
  getStoryView,
  parseStoryJson,
  transitionStory,
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

The in-memory engine starts validated stories, exposes player-safe active or
ending views, selects choices by ID, and returns a new immutable session with
history for every successful transition. Forged or mismatched sessions and
invalid commands return typed failures. See
[`docs/engine-api.md`](docs/engine-api.md) for the complete API and transition
semantics.

This release has no terminal gameplay loop or built-in episode.

Engine views can be rendered by the internal terminal presentation layer with
the existing color, Unicode, fast-output, reduced-motion, typewriter, and
cancellation behavior. It presents narrative, numbered choices, endings, and
typed transition failures without exposing target node IDs. See
[`docs/story-presentation.md`](docs/story-presentation.md). Input and gameplay
orchestration are not implemented.

## License

MIT
