# In-memory engine API

BhootOS provides pure functions for traversing validated Story Document v1 and
v2 values in memory. The engine has no terminal, input, timing, filesystem,
environment, or persistence behavior.

## Create a session

```ts
import { createStorySession, type StoryDocumentV1 } from "bhootos";

const result = createStorySession(story);
if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.path, diagnostic.message);
  }
} else {
  console.log(result.session.currentNodeId);
}
```

`createStorySession` structurally parses and statically validates the supplied
document before creating state. V1 sessions retain their original compact
shape. V2 sessions add `storySchemaVersion: 2`, frozen flags, and a sorted,
duplicate-free inventory.

An initial session has step `0`, an empty history, and points to
`entryNodeId`. It is `active` when the entry is a normal node and immediately
`ended` when the entry itself is an ending. The public session contains only
the story ID, current node ID, status, optional ending ID, step, and history; it
does not retain or expose the complete story.

Sessions and their history arrays are immutable snapshots. Each successful
transition returns a new snapshot and leaves previous snapshots unchanged.

## Read the current view

```ts
import { getStoryView } from "bhootos";

const viewed = getStoryView(story, session);
if (!viewed.ok) {
  console.error(viewed.code, viewed.message);
} else if (viewed.view.status === "active") {
  console.log(viewed.view.text, viewed.view.choices);
} else {
  console.log(viewed.view.text, viewed.view.ending.title);
}
```

An active view contains the current node text and currently visible ordered
choice `id`/`label` pairs. V2 requirements are evaluated purely against session
state. Hidden choices and `nextNodeId` values are omitted.

An ending view contains the node text plus the ending ID and title.

## Select a choice

```ts
import { transitionStory } from "bhootos";

const transitioned = transitionStory(story, session, {
  type: "select-choice",
  choiceId: "enter",
});

if (!transitioned.ok) {
  console.error(transitioned.code, transitioned.message);
} else {
  session = transitioned.session;
  console.log(transitioned.view);
}
```

A successful command:

1. resolves the exact choice ID only at the current node;
2. applies v2 effects in document order to a temporary state;
3. verifies ending requirements and target choice availability;
4. commits atomically, advances, and increments the step once;
5. appends one replayable history entry; and
6. returns the new session and current filtered view.

The result is `ended` when the target has an ending and remains `active`
otherwise. Equal story, session, and command values produce equivalent results.

Expected failures use stable codes:

| Code | Meaning |
| --- | --- |
| `story-mismatch` | The session belongs to a different story ID. |
| `invalid-session` | Session fields or history are inconsistent with the story. |
| `invalid-command` | The command is not a valid choice-selection command. |
| `session-ended` | A choice was attempted after reaching an ending. |
| `current-node-missing` | The session's current node does not exist. |
| `choice-not-found` | The choice is not available at the current node. |
| `choice-target-missing` | The selected choice references a missing node. |
| `no-available-choices` | State leaves an active node with zero visible choices. |
| `effect-failed` | An ordered effect could not be applied atomically. |
| `ending-requirements-not-met` | The target ending is not valid for current state. |

## History semantics

Each history entry records:

```ts
interface StoryHistoryEntry {
  readonly step: number;
  readonly fromNodeId: string;
  readonly choiceId: string;
  readonly toNodeId: string;
  readonly effects?: readonly StoryEffectV2[];
  readonly flags?: Readonly<Record<string, StoryFlagValue>>;
  readonly inventory?: readonly string[];
}
```

History steps begin at `1` and remain sequential. Entries must form a
continuous path beginning at the story entry node, every choice and target must
match the story, and the final target must equal `currentNodeId`. The engine
checks these invariants whenever a session is viewed or transitioned, so a
forged session cannot skip directly to another node or ending. For v2, replay
also checks choice visibility, applied effects, ending gates, flags, inventory,
and every recorded resulting-state snapshot.

## Cycles

Cycles and self-loops are normal transitions. A self-loop appends one history
entry and increments the step while leaving the node active. The engine applies
no hidden step limit and does not recursively traverse the graph during a
command. The caller remains responsible for deciding whether to stop a long
session.

## Complete example

This is the data from `examples/minimal-story.json` represented directly in
TypeScript:

```ts
import {
  createStorySession,
  getStoryView,
  transitionStory,
  type StoryDocumentV1,
} from "bhootos";

const story: StoryDocumentV1 = {
  schemaVersion: 1,
  id: "minimal-story",
  title: "Minimal Story",
  description: "A tiny example story.",
  entryNodeId: "start",
  nodes: [
    {
      id: "start",
      text: "The door is open.",
      choices: [
        { id: "enter", label: "Enter", nextNodeId: "ending-safe" },
      ],
    },
    {
      id: "ending-safe",
      text: "You made it outside.",
      ending: { id: "safe", title: "Safe" },
    },
  ],
};

const created = createStorySession(story);
if (!created.ok) {
  throw new Error("The example story is invalid.");
}

const active = getStoryView(story, created.session);
if (!active.ok || active.view.status !== "active") {
  throw new Error("Expected an active view.");
}

const finished = transitionStory(story, created.session, {
  type: "select-choice",
  choiceId: "enter",
});
if (!finished.ok || finished.session.status !== "ended") {
  throw new Error("Expected the story to end.");
}

console.log(finished.session.endingId); // "safe"
```

Adding an existing item is idempotent. Removing a missing item is a typed
`effect-failed` result, and no earlier effect from that choice is committed.
The engine itself does not save; hosts can use the gameplay transition hook.
