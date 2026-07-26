export interface ReadLineOptions {
  readonly prompt?: string;
  readonly signal?: AbortSignal;
}

export type ReadLineResult =
  | {
      readonly status: "line";
      readonly value: string;
    }
  | {
      readonly status: "eof";
    }
  | {
      readonly status: "cancelled";
    };

export interface LineInput {
  readLine(options?: ReadLineOptions): Promise<ReadLineResult>;
}

export type ChoiceInputErrorCode =
  | "empty-input"
  | "invalid-number"
  | "choice-out-of-range"
  | "invalid-active-view";

export type ChoiceSelectionResult =
  | {
      readonly ok: true;
      readonly choiceId: string;
      readonly choiceNumber: number;
    }
  | {
      readonly ok: false;
      readonly code: ChoiceInputErrorCode;
      readonly message: string;
    };

export interface RequestStoryChoiceOptions {
  readonly prompt?: string;
  readonly signal?: AbortSignal;
}

export type RequestStoryChoiceResult =
  | {
      readonly status: "selected";
      readonly choiceId: string;
      readonly choiceNumber: number;
    }
  | {
      readonly status: "invalid";
      readonly code: ChoiceInputErrorCode;
      readonly message: string;
    }
  | {
      readonly status: "eof";
    }
  | {
      readonly status: "cancelled";
    };
