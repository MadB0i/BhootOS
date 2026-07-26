import type {
  ActiveStoryView,
  EndingStoryView,
  StoryEngineFailure,
  StorySession,
  StoryTransitionErrorCode,
  StoryView,
} from "../engine/types.js";
import type {
  RequestStoryChoiceOptions,
  RequestStoryChoiceResult,
} from "../input/types.js";
import type { StoryDiagnostic } from "../story/diagnostics.js";

export interface StoryGameplayRenderOptions {
  readonly animateText?: boolean;
  readonly signal?: AbortSignal;
}

export interface StoryGameplayRenderer {
  render(
    view: StoryView,
    options?: StoryGameplayRenderOptions,
  ): Promise<void>;
  renderTransitionError(error: StoryEngineFailure): void;
  renderInputError(message: string): void;
}

export interface StoryChoiceRequester {
  request(
    view: ActiveStoryView,
    options?: RequestStoryChoiceOptions,
  ): Promise<RequestStoryChoiceResult>;
}

export interface StoryGameplayDependencies {
  readonly renderer: StoryGameplayRenderer;
  readonly choiceRequester: StoryChoiceRequester;
}

export interface RunStoryOptions {
  readonly initialSession?: StorySession;
  readonly signal?: AbortSignal;
  readonly animateText?: boolean;
  readonly choicePrompt?: string;
  readonly maxInvalidAttempts?: number;
}

export type StoryGameplayErrorCode =
  | "invalid-options"
  | "session-creation-failed"
  | "session-invalid"
  | "view-failed"
  | "transition-failed"
  | "presentation-failed"
  | "input-failed";

export type RunStoryResult =
  | {
      readonly status: "ended";
      readonly session: StorySession;
      readonly view: EndingStoryView;
    }
  | {
      readonly status: "cancelled";
      readonly session?: StorySession;
    }
  | {
      readonly status: "eof";
      readonly session: StorySession;
      readonly view: ActiveStoryView;
    }
  | {
      readonly status: "invalid-attempt-limit";
      readonly session: StorySession;
      readonly view: ActiveStoryView;
      readonly attempts: number;
    }
  | {
      readonly status: "failed";
      readonly code: StoryGameplayErrorCode;
      readonly message: string;
      readonly session?: StorySession;
      readonly engineCode?: StoryTransitionErrorCode;
      readonly diagnostics?: readonly StoryDiagnostic[];
    };
