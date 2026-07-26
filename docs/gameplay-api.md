# In-memory gameplay API

`runStory` is a CLI-independent orchestrator for playing a complete Story
Document v1 or v2 through injected presentation and choice-request dependencies. It
uses the deterministic engine internally and performs no filesystem, process,
environment, stream, timing, or terminal access.

## Dependencies

Embedders supply two narrow interfaces:

```ts
interface StoryGameplayRenderer {
  render(
    view: StoryView,
    options?: {
      readonly animateText?: boolean;
      readonly signal?: AbortSignal;
    },
  ): Promise<void>;

  renderTransitionError(error: StoryEngineFailure): void;
  renderInputError(message: string): void;
}

interface StoryChoiceRequester {
  request(
    view: ActiveStoryView,
    options?: RequestStoryChoiceOptions,
  ): Promise<RequestStoryChoiceResult>;
}
```

These contracts contain no Chalk, Node stream, readline, or CLI types. The
internal terminal composition adapts the existing `StoryViewRenderer`,
`LineInput`, and `requestStoryChoice` without duplicating presentation or
number parsing.

## Running a story

```ts
import {
  runStory,
  type StoryGameplayDependencies,
  type StoryDocumentV1,
} from "bhootos";

const scriptedChoices = ["finish"];
const dependencies: StoryGameplayDependencies = {
  renderer: {
    render: async (view) => {
      console.log(view.text);
    },
    renderInputError: (message) => {
      console.error(message);
    },
    renderTransitionError: (error) => {
      console.error(error.message);
    },
  },
  choiceRequester: {
    request: async () => ({
      status: "selected",
      choiceId: scriptedChoices.shift() ?? "",
      choiceNumber: 1,
    }),
  },
};

const result = await runStory(story, dependencies, {
  animateText: false,
  choicePrompt: "> ",
  maxInvalidAttempts: 3,
  onTransition: async (session) => {
    await saveSession(session);
  },
});

if (result.status === "ended") {
  console.log(result.view.ending.title, result.session.history);
}
```

The example uses a scripted requester to show the portable contract. A real
host can compose its own UI or input boundary.

## Fresh and resumed sessions

When `initialSession` is omitted, `runStory` validates the story and creates a
fresh session through `createStorySession`. Session-creation failures return
`status: "failed"`, code `session-creation-failed`, and the story diagnostics.

When `initialSession` is supplied, the engine validates it against the story
before any rendering or input. Its step and history are preserved. Invalid or
mismatched sessions return `session-invalid` with the engine failure code and
message. The orchestrator never repairs or recreates history.

An entry ending or already-ended resumed session is rendered once and returned
without requesting input.

## Loop ordering

For each arrived view, the orchestrator:

1. checks cancellation;
2. renders the view once;
3. returns immediately if it is an ending;
4. requests one numbered choice from an active view;
5. handles invalid input, EOF, or cancellation;
6. applies a selected choice through `transitionStory`; and
7. awaits the optional `onTransition` persistence hook; and
8. continues with the transition's returned session and view.

Using the transition's view prevents an ending from being rendered twice.
There is no hidden limit on successful transitions.

`onTransition` runs after the engine has produced the new immutable session and
before the next view is rendered. It is called for active and ending
transitions. A rejection returns `persistence-failed` with that new session;
the gameplay loop does not continue or pretend the save succeeded.

## Invalid input

Invalid input does not call the engine, change history, or rerender the
narrative. The provided input message is rendered unchanged, then another
choice is requested.

`maxInvalidAttempts` is the maximum consecutive invalid attempts at one node.
It defaults to `3`, must be a positive safe integer, and resets after every
successful transition. Reaching it returns:

```ts
{
  status: "invalid-attempt-limit";
  session: StorySession;
  view: ActiveStoryView;
  attempts: number;
}
```

The final invalid message is still rendered, but no further request is made.

## EOF and cancellation

EOF returns the current active session and view without a transition, extra
output, farewell message, or history entry.

Cancellation is checked before session creation, every render, every input
request, every transition, and every new iteration. It is also recognized
during signal-aware rendering and input. Cancellation after a successful
transition returns the updated session before rendering the next view.
Pre-aborted execution returns `cancelled` without a session because no session
is created.

EOF and cancellation are always distinct. Ending views request no input and
therefore cannot produce EOF.

## Results

`RunStoryResult` has these statuses:

| Status | Meaning |
| --- | --- |
| `ended` | An ending was rendered; includes its session and ending view. |
| `cancelled` | Work stopped at a cancellation boundary; includes a session when one exists. |
| `eof` | Input ended at an active view without transitioning. |
| `invalid-attempt-limit` | Consecutive invalid input reached the configured limit. |
| `failed` | An expected configuration or typed engine failure occurred. |

Stable failure codes are `invalid-options`, `session-creation-failed`,
`session-invalid`, `view-failed`, `transition-failed`,
and `persistence-failed`. Typed engine failures preserve their original message
and expose the original engine code.

Unexpected renderer, requester, input-error renderer, transition-error
renderer, or engine exceptions propagate unchanged. They are not converted to
generic failures, so programming and dependency defects remain visible.

## Cycles and determinism

Self-loops and multi-node cycles are allowed. Every valid transition appends
one deterministic history entry, and the invalid-attempt counter resets after
the transition. The orchestrator has no randomness, clock access, or hidden
transition ceiling; termination depends on the story, scripted input, EOF,
cancellation, or the invalid-attempt limit.

This API makes in-memory stories playable by library embedders with injected
dependencies. It does not load story files or install a default terminal input
adapter. The CLI composes those separately.
