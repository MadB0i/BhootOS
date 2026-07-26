import type {
  StoryEngineFailure,
  StoryView,
} from "../engine/types.js";
import { TerminalRenderer } from "./renderer.js";
import {
  DEFAULT_CHARACTER_DELAY_MS,
  DEFAULT_PUNCTUATION_DELAY_MS,
} from "./typewriter.js";
import { formatChoice, formatNarrative } from "./layout.js";

export interface StoryViewRenderOptions {
  readonly animateText?: boolean;
  readonly signal?: AbortSignal;
}

export type StoryPresentationErrorCode =
  | "invalid-active-view"
  | "invalid-ending-view"
  | "invalid-story-view";

export class StoryPresentationError extends TypeError {
  override readonly name = "StoryPresentationError";
  readonly code: StoryPresentationErrorCode;

  constructor(code: StoryPresentationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class StoryViewRenderer {
  private readonly renderer: TerminalRenderer;

  constructor(renderer: TerminalRenderer) {
    this.renderer = renderer;
  }

  async render(
    view: StoryView,
    options: StoryViewRenderOptions = {},
  ): Promise<void> {
    const input: unknown = view;
    if (!isRecord(input)) {
      throw new StoryPresentationError(
        "invalid-story-view",
        "Story view must be an object.",
      );
    }

    const status = input["status"];
    if (status === "active") {
      const activeView = validateActiveView(input);
      await this.renderNarrative(activeView.text, options);
      this.renderer.writeLine();
      for (const [index, choice] of activeView.choices.entries()) {
        for (const line of formatChoice(
          index + 1,
          choice.label,
          this.renderer.getContentWidth(),
        )) {
          this.renderer.writeLine(line);
        }
      }
      return;
    }

    if (status === "ended") {
      const endingView = validateEndingView(input);
      await this.renderNarrative(endingView.text, options);
      this.renderer.writeLine();
      this.renderer.writeTitleLine("ENDING");
      this.renderer.writeLine(endingView.ending.title);
      return;
    }

    throw new StoryPresentationError(
      "invalid-story-view",
      'Story view status must be "active" or "ended".',
    );
  }

  renderTransitionError(error: StoryEngineFailure): void {
    this.renderer.writeDangerError(error.message);
  }

  renderInputError(message: string): void {
    this.renderer.writeDangerError(message);
  }

  private async renderNarrative(
    text: string,
    options: StoryViewRenderOptions,
  ): Promise<void> {
    await this.renderer.typewriteLine(
      formatNarrative(text, this.renderer.getContentWidth()),
      {
      enabled: options.animateText ?? true,
      characterDelayMs: DEFAULT_CHARACTER_DELAY_MS,
      punctuationDelayMs: DEFAULT_PUNCTUATION_DELAY_MS,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
  }
}

interface ValidActiveView {
  readonly text: string;
  readonly choices: readonly ValidChoice[];
}

interface ValidChoice {
  readonly label: string;
}

interface ValidEndingView {
  readonly text: string;
  readonly ending: {
    readonly title: string;
  };
}

function validateActiveView(view: UnknownRecord): ValidActiveView {
  if (typeof view["text"] !== "string") {
    throw new StoryPresentationError(
      "invalid-active-view",
      "Active story view text must be a string.",
    );
  }

  const choices = view["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new StoryPresentationError(
      "invalid-active-view",
      "Active story view must contain at least one choice.",
    );
  }

  const validChoices: ValidChoice[] = [];
  for (const [index, choice] of choices.entries()) {
    if (
      !isRecord(choice) ||
      !isNonEmptyString(choice["id"]) ||
      !isNonEmptyString(choice["label"]) ||
      containsLineBreak(choice["label"])
    ) {
      throw new StoryPresentationError(
        "invalid-active-view",
        `Active story view choice ${String(index)} must contain a valid ID and single-line label.`,
      );
    }
    validChoices.push({ label: choice["label"] });
  }

  return {
    text: view["text"],
    choices: validChoices,
  };
}

function validateEndingView(view: UnknownRecord): ValidEndingView {
  if (typeof view["text"] !== "string") {
    throw new StoryPresentationError(
      "invalid-ending-view",
      "Ending story view text must be a string.",
    );
  }

  const ending = view["ending"];
  if (
    !isRecord(ending) ||
    !isNonEmptyString(ending["id"]) ||
    !isNonEmptyString(ending["title"]) ||
    containsLineBreak(ending["title"])
  ) {
    throw new StoryPresentationError(
      "invalid-ending-view",
      "Ending story view must contain a valid ending ID and single-line title.",
    );
  }

  return {
    text: view["text"],
    ending: { title: ending["title"] },
  };
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function containsLineBreak(value: string): boolean {
  return value.includes("\n") || value.includes("\r");
}
