# Play command

`bhootos play <story-file>` loads, validates, and plays one explicit Story
Document v1 JSON file:

```bash
bhootos play ./examples/minimal-story.json
bhootos --fast --no-color --ascii play ./examples/minimal-story.json
bhootos play ./examples/minimal-story.json --fast --no-color --ascii
```

The path is required and must be the only positional argument. BhootOS does not
search directories, choose a default story, read a manifest, or fetch network
content. Relative paths are resolved by Node from the current working
directory.

## Terminal behavior

Story narrative, numbered choices, endings, and the `> ` choice prompt are
written to stdout. Load, validation, input, and gameplay errors are written to
stderr. The command does not display the boot screen.

The root options `--no-color`, `--ascii`, `--reduced-motion`, and `--fast` use
the same capability detection and renderer behavior as the existing CLI. They
may appear before or after `play`. Non-TTY input and output use the same
line-oriented protocol without enabling raw mode, clearing the screen, or
closing caller-owned streams.

Expected loading failures contain no stack trace. A validation failure starts
with the source-aware summary and retains diagnostics in their original order:

```text
bhootos: Story document failed validation: ./broken.json
  $.nodes[0].id [duplicate-node-id] Node IDs must be unique.
```

The normal filesystem and loader rules—including the 1 MiB default maximum,
fatal UTF-8 decoding, JSON parsing, and full graph validation—are documented in
[`story-loading.md`](story-loading.md).

## Input and early termination

Enter a canonical 1-based choice number such as `1` and press Enter. Choice
IDs are not accepted directly. Invalid lines use the existing bounded retry
behavior; BhootOS does not enable raw mode or provide arrow-key menus.

EOF before an ending stops without a farewell or repeated narrative and exits
with code `4`. `Ctrl-C` requests cancellation and exits with code `130`.

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | The story reached an ending. |
| `1` | CLI usage error or unexpected exception. |
| `2` | Story read, parse, or validation failure. |
| `3` | The invalid-choice attempt limit was exhausted. |
| `4` | Input reached EOF before the story ended. |
| `5` | Gameplay returned a typed failure. |
| `130` | Loading, rendering, or input was cancelled. |

`Ctrl-C` aborts the active play operation through one temporary SIGINT listener.
The listener is removed after every outcome, including loading errors and
unexpected rejections. BhootOS sets `process.exitCode`; it does not call
`process.exit()`.

## Current limitations

Only explicit local Story Document v1 files are supported. The package includes
**Kaun Hai?** as a story file, but there is no automatic episode selection,
story discovery, remote loading, save/continue, inventory, arrow-key
navigation, sound, or raw-terminal interface.
