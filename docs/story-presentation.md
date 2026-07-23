# Story presentation

The internal story presentation layer renders engine `StoryView` values through
the existing `TerminalRenderer`. It contains no input handling, gameplay loop,
filesystem access, environment detection, or direct process I/O.

The dependency direction is:

```text
StoryView and engine failures
            ↓
      StoryViewRenderer
            ↓
      TerminalRenderer
```

The presentation classes are intentionally not exported from the package root.
They are an internal boundary for a future terminal gameplay adapter.

## Active view layout

An active view renders its narrative exactly as supplied, followed by one blank
line and its choice labels in document order:

```text
The door is open.

  1. Enter
  2. Walk away
```

Numbering begins at `1`. Each choice occupies one logical line. Node IDs, choice
IDs, and target node IDs are not displayed. An empty choice array, malformed
choice, or multiline forged choice label throws a `StoryPresentationError` with
code `invalid-active-view`.

## Ending layout

An ending uses a small semantic title marker:

```text
You made it outside.

ENDING
Safe
```

The narrative and title remain present in color, no-color, Unicode, and ASCII
modes. Ending and node IDs are not displayed. Missing or malformed ending
metadata throws `StoryPresentationError` with code `invalid-ending-view`.
Unsupported forged view statuses use `invalid-story-view`.

## Animation and accessibility

Narrative text delegates to the existing `TerminalRenderer` typewriter using
the exported default character and punctuation delays. It animates only when:

- the terminal is interactive;
- reduced motion is disabled;
- the renderer is not in fast mode; and
- `animateText` was not explicitly set to `false`.

Otherwise the narrative is written immediately and exactly, including
intentional line breaks and Unicode content. Choices and ending metadata are
written immediately after successful narrative completion.

## Cancellation

`StoryViewRenderOptions.signal` is passed through to the existing typewriter.
A signal aborted before rendering writes nothing and rejects with the existing
`CancellationError`. Cancellation during narrative output:

- stops future narrative characters;
- does not append the narrative line terminator;
- does not add a blank section; and
- prevents choices or ending metadata from being rendered.

The presentation layer does not convert unrelated scheduler or renderer
failures into cancellation; they propagate unchanged.

## Transition failures

`renderTransitionError` accepts the engine's existing `StoryEngineFailure` and
writes its message exactly once through the renderer's danger style:

```ts
presentation.renderTransitionError(failure);
```

Transition failures are written to stderr with exactly one trailing newline.
No stack trace or replacement message is generated. With color disabled, the
output contains no ANSI sequences.

## Internal usage

```ts
import { StoryViewRenderer } from "../src/terminal/story-view-renderer.js";

const presentation = new StoryViewRenderer(terminalRenderer);
const viewed = getStoryView(story, session);

if (viewed.ok) {
  await presentation.render(viewed.view, {
    animateText: true,
    signal,
  });
} else {
  presentation.renderTransitionError(viewed);
}
```

This layer only presents existing views and failures. Reading input, selecting
choices, orchestrating gameplay, and exposing a CLI `play` command remain
unimplemented.
