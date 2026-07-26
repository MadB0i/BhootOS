# CLI reference

| Command | Behavior | Success |
| --- | --- | ---: |
| `bhootos` | Brief intro, then fresh bundled play | 0 at ending |
| `bhootos play` | Fresh bundled play | 0 at ending |
| `bhootos play <story-file>` | Play one custom v1/v2 JSON file | 0 at ending |
| `bhootos continue` | Resume the active bundled save | 0 at ending |
| `bhootos restart` | Replace the active run, preserving valid ending history | 0 at ending |
| `bhootos endings` | List discovered titles and `???` slots | 0 |
| `bhootos validate <story-file>` | Validate without gameplay or writes | 0 |
| `bhootos create-story <name>` | Create a minimal v2 project | 0 |
| `bhootos doctor` | Print detected terminal capabilities | 0 |
| `bhootos intro` | Show the full boot sequence | 0 |

Global options may precede or follow commands:

- `--no-color`
- `--ascii`
- `--reduced-motion`
- `--fast`
- `--help`
- `--version`

Stable command exit codes are:

| Code | Meaning |
| ---: | --- |
| 0 | Successful non-game command or story ending |
| 1 | CLI usage or unexpected boundary failure |
| 2 | Story read, parse, or validation failure |
| 3 | Invalid-choice attempt limit |
| 4 | EOF before an ending |
| 5 | Typed gameplay/session failure |
| 6 | No active bundled save to continue |
| 7 | Bundled save read/write failure |
| 8 | Invalid `create-story` name |
| 9 | Starter destination or write failure |
| 130 | Clean cancellation |

No successful bundled command prints its installed source path.
