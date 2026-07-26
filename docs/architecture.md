# Architecture

BhootOS keeps reusable narrative logic separate from Node and terminal edges:

```text
Story JSON
   |
reader -> parser -> validator -> immutable story
                                |
                      session / view / transition
                                |
                    in-memory gameplay loop
                         /              \
                  renderer          choice input

CLI adapters: Node files, terminal streams, signals, package content, saves
```

The package root exports story, engine, numbered-input, and gameplay contracts.
It does not export the Node file reader, terminal composition, bundled episode,
save path, or author-command filesystem adapter. Distribution verification
rejects `node:fs`, `node:readline`, and process stdin/stdout dependencies from
the public bundle.

## Story boundary

The parser accepts unknown JSON and produces a frozen versioned document or
ordered diagnostics. The validator performs deterministic identifier,
reference, reachability, ending-path, and bounded v2 state checks. It does not
execute content or attempt an undecidable proof of all dynamic routes.

## Engine boundary

The engine is pure with respect to external state. Sessions are immutable
snapshots. V2 conditions filter player-safe views; effects apply to a temporary
state in document order and commit atomically. Every supplied session is
replayed from the entry state before it can be viewed or transitioned.

## Gameplay boundary

`runStory` coordinates a supplied renderer and choice requester. It owns no
terminal or file objects. An optional transition hook lets a host persist each
successful transition; persistence failures are typed.

## CLI boundary

The CLI composes Node adapters. Bundled content resolves from `import.meta.url`,
not the working directory. Custom files are user-selected and not autosaved.
Bundled saves use a fixed user-data path and validate against the packaged
story before resume.

Terminal animation skipping temporarily uses raw input only for an interactive
animation. The session consumes keys, forwards Ctrl+C to the command abort
controller, and restores listeners, flow state, and raw mode in `finally`.
