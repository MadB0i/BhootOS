import type { StoryDiagnostic } from "../story/index.js";

export interface StoryHistoryEntry {
  readonly step: number;
  readonly fromNodeId: string;
  readonly choiceId: string;
  readonly toNodeId: string;
}

export type StorySessionStatus = "active" | "ended";

export interface StorySession {
  readonly storyId: string;
  readonly currentNodeId: string;
  readonly status: StorySessionStatus;
  readonly endingId?: string;
  readonly step: number;
  readonly history: readonly StoryHistoryEntry[];
}

export interface StoryViewChoice {
  readonly id: string;
  readonly label: string;
}

export interface ActiveStoryView {
  readonly status: "active";
  readonly nodeId: string;
  readonly text: string;
  readonly choices: readonly StoryViewChoice[];
}

export interface EndingStoryView {
  readonly status: "ended";
  readonly nodeId: string;
  readonly text: string;
  readonly ending: {
    readonly id: string;
    readonly title: string;
  };
}

export type StoryView = ActiveStoryView | EndingStoryView;

export interface SelectChoiceCommand {
  readonly type: "select-choice";
  readonly choiceId: string;
}

export type StoryTransitionErrorCode =
  | "story-mismatch"
  | "invalid-session"
  | "invalid-command"
  | "session-ended"
  | "current-node-missing"
  | "choice-not-found"
  | "choice-target-missing";

export interface StoryEngineFailure {
  readonly ok: false;
  readonly code: StoryTransitionErrorCode;
  readonly message: string;
}

export type StorySessionCreationResult =
  | {
      readonly ok: true;
      readonly session: StorySession;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly StoryDiagnostic[];
    };

export type StoryViewResult =
  | {
      readonly ok: true;
      readonly view: StoryView;
    }
  | StoryEngineFailure;

export type StoryTransitionResult =
  | {
      readonly ok: true;
      readonly session: StorySession;
      readonly view: StoryView;
    }
  | StoryEngineFailure;
