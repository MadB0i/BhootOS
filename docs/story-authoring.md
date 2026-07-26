# Story authoring

Create a compact Story Document v2 project in the current directory:

```sh
bhootos create-story haunted-station
cd haunted-station
bhootos validate ./story.json
bhootos play ./story.json
```

Names use the same stable identifier grammar as story IDs: 1–64 lowercase
ASCII letters, digits, and single internal hyphens, beginning with a letter.
The command creates only `<name>/story.json` and `<name>/README.md`, refuses an
existing destination, and never initializes Git.

`validate` uses the production UTF-8 reader, size limit, parser, and graph
validator. It supports v1 and v2 and reports the schema, node count, and ending
count on success. Its checks are structural and deterministic; it does not
claim to prove every possible dynamic route through a stateful story.

The starter is intentionally small: one decision, one ending, empty flags, and
empty inventory. See [story-format-v2.md](story-format-v2.md) before adding
requirements or effects. Existing v1 stories remain supported as documented in
[story-format-v1.md](story-format-v1.md).
