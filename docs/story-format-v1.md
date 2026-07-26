# Story Document v1

Story Document v1 is BhootOS's versioned JSON format for a static branching
story graph. Parsing, validation, loading, engine traversal, and CLI play all
remain supported alongside Story Document v2.

## Document fields

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be exactly `1`. |
| `id` | identifier | yes | Story identifier. |
| `title` | string | yes | 1–80 characters. |
| `description` | string | no | 0–500 characters. |
| `entryNodeId` | identifier | yes | Must reference an existing node. |
| `nodes` | node array | yes | 1–1000 entries. |

Unknown fields are rejected at every level.

## Node fields

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `id` | identifier | yes | Unique across the document. |
| `text` | string | yes | 1–4000 characters. |
| `choices` | choice array | for non-ending nodes | 1–32 entries when present. |
| `ending` | ending object | for ending nodes | Must not appear with `choices`. |

A node is either a normal node with at least one choice or an ending node with
an `ending` object. It cannot be both.

Narrative fields (`description` and node `text`) may contain line breaks,
carriage returns, and tabs. Other control characters are rejected. Titles and
choice labels reject control characters, including line breaks and tabs.
Content is measured by Unicode code points and is never trimmed or rewritten.

## Choice fields

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `id` | identifier | yes | Unique within its containing node. |
| `label` | string | yes | 1–160 characters. |
| `nextNodeId` | identifier | yes | Must reference an existing node. |

The same choice ID may be reused in different nodes.

## Ending fields

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `id` | identifier | yes | Unique across the document. |
| `title` | string | yes | 1–120 characters. |

## Identifier rules

Story, node, choice, and ending identifiers:

- contain 1–64 characters;
- begin with a lowercase ASCII letter;
- contain only lowercase ASCII letters, digits, and hyphens;
- do not end with a hyphen; and
- do not contain consecutive hyphens.

For example, `temple-gate` and `ending-safe` are valid. `Temple`, `-ending`,
`ending-`, `two--hyphens`, and `room_1` are invalid.

## Graph requirements

Every node and choice target is resolved by identifier. From `entryNodeId`, at
least one ending must be reachable. The validator also reports:

- nodes and endings that cannot be reached from the entry;
- reachable non-ending nodes from which no ending can be reached; and
- duplicate node, per-node choice, or document-wide ending identifiers.

Cycles are valid when an exit path reaches an ending. A self-loop is also valid
when another choice can eventually reach an ending. Traversal is iterative, so
the supported 1000-node maximum does not depend on the JavaScript call stack.

## Valid example

```json
{
  "schemaVersion": 1,
  "id": "minimal-story",
  "title": "Minimal Story",
  "entryNodeId": "start",
  "nodes": [
    {
      "id": "start",
      "text": "The door is open.",
      "choices": [
        {
          "id": "enter",
          "label": "Enter",
          "nextNodeId": "ending-safe"
        }
      ]
    },
    {
      "id": "ending-safe",
      "text": "You made it outside.",
      "ending": {
        "id": "safe",
        "title": "Safe"
      }
    }
  ]
}
```

The repository's complete example is
[`examples/minimal-story.json`](../examples/minimal-story.json).

## Parsing and diagnostics

```ts
import { parseStoryJson } from "bhootos";

const result = parseStoryJson(json, "story.json");
if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.path, diagnostic.message);
  }
}
```

`parseStoryJson` distinguishes invalid JSON syntax from structurally invalid
documents. `parseStoryDocument` accepts `unknown` and does not mutate its input.
Expected validation failures are returned rather than thrown.

Each diagnostic has a stable machine-readable `code`, an `error` or `warning`
severity, a JSON-style path such as
`$.nodes[2].choices[0].nextNodeId`, and a specific message. Diagnostic ordering
is deterministic. Errors produce `ok: false`; warnings can accompany an
otherwise valid story in an `ok: true` result.
