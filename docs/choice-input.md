# Numbered choice input

BhootOS provides a small, reusable boundary for turning one line of input into
an active story choice ID. It is separate from terminal presentation and from
engine transitions.

## Numbering and syntax

Choice numbers are 1-based and follow the active view's `choices` array order.
That is the same order used by the internal `StoryViewRenderer`:

```text
  1. Open the door
  2. Wait
```

`1`, `2`, and values with leading or trailing whitespace such as `  2 ` are
accepted. After surrounding whitespace is removed, the value must contain only
ASCII digits. It must not contain leading zeroes and must represent a positive
safe integer within the available choice range.

Examples that are rejected include:

```text
(empty or whitespace only)
0
-1
1.5
01
+1
1e2
NaN
Infinity
abc
1 extra
```

Input is never clamped, corrected, interpreted as a choice ID, or resolved to a
target node ID.

## Pure selection

```ts
import { selectChoiceFromLine, type ActiveStoryView } from "bhootos";

const result = selectChoiceFromLine(view, "2");
if (result.ok) {
  console.log(result.choiceNumber, result.choiceId);
} else {
  console.error(result.code, result.message);
}
```

Success contains the chosen 1-based number and exact choice ID. Failures use
one of these stable codes:

| Code | Meaning |
| --- | --- |
| `empty-input` | The line is empty after surrounding whitespace is removed. |
| `invalid-number` | The syntax is not canonical ASCII digits or the value is not a safe integer. |
| `choice-out-of-range` | The number is not one of the active choices. |
| `invalid-active-view` | The supplied view is not active or has missing, malformed, empty, or duplicate choices. |

The selector does not mutate the line or view.

## Requesting one line

`LineInput` is the injectable boundary:

```ts
interface LineInput {
  readLine(options?: {
    readonly prompt?: string;
    readonly signal?: AbortSignal;
  }): Promise<
    | { readonly status: "line"; readonly value: string }
    | { readonly status: "eof" }
    | { readonly status: "cancelled" }
  >;
}
```

Test and embedding code can implement this interface without using real stdin.
The internal Node adapter accepts caller-owned readable and writable streams; it
does not use global process streams, change raw mode, exit the process, or close
those streams.

`requestStoryChoice` performs exactly one `readLine` call:

```ts
import { requestStoryChoice } from "bhootos";

const requested = await requestStoryChoice(input, view, {
  prompt: "> ",
  signal,
});
```

The default prompt is `> `. A custom prompt is passed unchanged. Invalid input
returns `status: "invalid"` and is not automatically retried. EOF returns
`status: "eof"`; cancellation returns `status: "cancelled"`. A signal that is
already aborted returns cancellation without requesting input or writing a
prompt. Unexpected adapter or stream failures reject the promise.

The line-input boundary preserves line content. Trimming and numeric
interpretation happen only in the choice selector.

## Deliberate separation

The input layer itself does not render choices or errors, perform an engine
transition, load stories, or orchestrate repeated prompts. A caller may pass a
successful `choiceId` to `transitionStory`, or use the separate `runStory`
library orchestrator to compose these operations.

A `bhootos play` command is not implemented.
