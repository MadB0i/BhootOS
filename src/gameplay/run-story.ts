import {
  createStorySession,
  getStoryView,
  transitionStory,
} from "../engine/index.js";
import type {
  ActiveStoryView,
  StoryEngineFailure,
  StorySession,
  StorySessionCreationResult,
  StoryTransitionResult,
  StoryView,
  StoryViewResult,
} from "../engine/types.js";
import type { StoryDocument } from "../story/types.js";
import type { StoryDiagnostic } from "../story/diagnostics.js";
import type {
  RunStoryOptions,
  RunStoryResult,
  StoryGameplayDependencies,
  StoryGameplayErrorCode,
  StoryGameplayRenderOptions,
} from "./types.js";

const DEFAULT_MAX_INVALID_ATTEMPTS = 3;

interface StoryGameplayEngine {
  createSession(story: StoryDocument): StorySessionCreationResult;
  getView(
    story: StoryDocument,
    session: StorySession,
  ): StoryViewResult;
  transition(
    story: StoryDocument,
    session: StorySession,
    choiceId: string,
  ): StoryTransitionResult;
}

export function runStory(
  story: StoryDocument,
  dependencies: StoryGameplayDependencies,
  options: RunStoryOptions = {},
): Promise<RunStoryResult> {
  return runStoryWithEngine(story, dependencies, options, {
    createSession: createStorySession,
    getView: getStoryView,
    transition: (currentStory, session, choiceId) =>
      transitionStory(currentStory, session, {
        type: "select-choice",
        choiceId,
      }),
  });
}

export async function runStoryWithEngine(
  story: StoryDocument,
  dependencies: StoryGameplayDependencies,
  options: RunStoryOptions,
  engine: StoryGameplayEngine,
): Promise<RunStoryResult> {
  if (isAborted(options.signal)) {
    return cancelled();
  }

  const maxInvalidAttempts =
    options.maxInvalidAttempts ?? DEFAULT_MAX_INVALID_ATTEMPTS;
  if (
    !Number.isSafeInteger(maxInvalidAttempts) ||
    maxInvalidAttempts < 1
  ) {
    return failure(
      "invalid-options",
      "maxInvalidAttempts must be a positive safe integer.",
    );
  }

  const initialSession = options.initialSession;
  const resumed = initialSession !== undefined;
  let session: StorySession;
  if (initialSession !== undefined) {
    session = initialSession;
  } else {
    const creation = engine.createSession(story);
    if (!creation.ok) {
      const diagnostics = Object.freeze([...creation.diagnostics]);
      const firstDiagnostic = diagnostics[0];
      return failure(
        "session-creation-failed",
        firstDiagnostic === undefined
          ? "Story session creation failed."
          : `Story session creation failed: ${firstDiagnostic.message}`,
        { diagnostics },
      );
    }
    session = creation.session;
  }

  if (isAborted(options.signal)) {
    return cancelled(session);
  }

  const initialView = engine.getView(story, session);
  if (!initialView.ok) {
    return engineFailure(
      resumed ? "session-invalid" : "view-failed",
      initialView,
      session,
    );
  }

  let view: StoryView = initialView.view;
  const renderOptions: StoryGameplayRenderOptions = {
    ...(options.animateText === undefined
      ? {}
      : { animateText: options.animateText }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  const requestOptions = {
    ...(options.choicePrompt === undefined
      ? {}
      : { prompt: options.choicePrompt }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };

  while (true) {
    if (isAborted(options.signal)) {
      return cancelled(session);
    }

    try {
      await dependencies.renderer.render(view, renderOptions);
    } catch (error: unknown) {
      if (isCancellationRejection(error, options.signal)) {
        return cancelled(session);
      }
      throw error;
    }

    if (isAborted(options.signal)) {
      return cancelled(session);
    }
    if (view.status === "ended") {
      return Object.freeze({ status: "ended", session, view });
    }

    const activeView: ActiveStoryView = view;
    let invalidAttempts = 0;

    while (true) {
      if (isAborted(options.signal)) {
        return cancelled(session);
      }

      let requested;
      try {
        requested = await dependencies.choiceRequester.request(
          activeView,
          requestOptions,
        );
      } catch (error: unknown) {
        if (isCancellationRejection(error, options.signal)) {
          return cancelled(session);
        }
        throw error;
      }

      if (isAborted(options.signal)) {
        return cancelled(session);
      }

      switch (requested.status) {
        case "cancelled":
          return cancelled(session);
        case "eof":
          return Object.freeze({
            status: "eof",
            session,
            view: activeView,
          });
        case "invalid":
          invalidAttempts += 1;
          dependencies.renderer.renderInputError(requested.message);
          if (isAborted(options.signal)) {
            return cancelled(session);
          }
          if (invalidAttempts >= maxInvalidAttempts) {
            return Object.freeze({
              status: "invalid-attempt-limit",
              session,
              view: activeView,
              attempts: invalidAttempts,
            });
          }
          break;
        case "selected": {
          if (isAborted(options.signal)) {
            return cancelled(session);
          }

          const transitioned = engine.transition(
            story,
            session,
            requested.choiceId,
          );
          if (!transitioned.ok) {
            dependencies.renderer.renderTransitionError(transitioned);
            return engineFailure(
              "transition-failed",
              transitioned,
              session,
            );
          }

          session = transitioned.session;
          view = transitioned.view;
          if (options.onTransition !== undefined) {
            try {
              await options.onTransition(session);
            } catch (error: unknown) {
              return failure(
                "persistence-failed",
                error instanceof Error
                  ? error.message
                  : "Story progress could not be saved.",
                { session },
              );
            }
          }
          if (isAborted(options.signal)) {
            return cancelled(session);
          }
          break;
        }
      }

      if (requested.status === "selected") {
        break;
      }
    }
  }
}

interface FailureDetails {
  readonly session?: StorySession;
  readonly engineCode?: StoryEngineFailure["code"];
  readonly diagnostics?: readonly StoryDiagnostic[];
}

function cancelled(session?: StorySession): RunStoryResult {
  return Object.freeze({
    status: "cancelled",
    ...(session === undefined ? {} : { session }),
  });
}

function engineFailure(
  code: Extract<
    StoryGameplayErrorCode,
    "session-invalid" | "view-failed" | "transition-failed"
  >,
  error: StoryEngineFailure,
  session: StorySession,
): RunStoryResult {
  return failure(code, error.message, {
    session,
    engineCode: error.code,
  });
}

function failure(
  code: StoryGameplayErrorCode,
  message: string,
  details: FailureDetails = {},
): RunStoryResult {
  return Object.freeze({
    status: "failed",
    code,
    message,
    ...(details.session === undefined ? {} : { session: details.session }),
    ...(details.engineCode === undefined
      ? {}
      : { engineCode: details.engineCode }),
    ...(details.diagnostics === undefined
      ? {}
      : { diagnostics: details.diagnostics }),
  });
}

function isCancellationRejection(
  error: unknown,
  signal: AbortSignal | undefined,
): boolean {
  return (
    signal?.aborted === true &&
    error instanceof Error &&
    (error.name === "CancellationError" || error.name === "AbortError")
  );
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
