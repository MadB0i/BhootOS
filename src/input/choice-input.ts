import type { ActiveStoryView } from "../engine/types.js";
import type {
  ChoiceInputErrorCode,
  ChoiceSelectionResult,
  LineInput,
  RequestStoryChoiceOptions,
  RequestStoryChoiceResult,
} from "./types.js";

const DEFAULT_CHOICE_PROMPT = "> ";
const ASCII_DIGITS = /^[0-9]+$/u;

export function selectChoiceFromLine(
  view: ActiveStoryView,
  line: string,
): ChoiceSelectionResult {
  const choices = validateActiveChoices(view);
  if (choices === undefined) {
    return choiceFailure(
      "invalid-active-view",
      "Active story view must contain valid, uniquely identified choices.",
    );
  }

  const value = line.trim();
  if (value.length === 0) {
    return choiceFailure("empty-input", "Enter a choice number.");
  }

  if (
    !ASCII_DIGITS.test(value) ||
    (value.length > 1 && value.startsWith("0"))
  ) {
    return invalidNumber(value);
  }

  const choiceNumber = Number(value);
  if (!Number.isSafeInteger(choiceNumber)) {
    return invalidNumber(value);
  }

  if (choiceNumber < 1 || choiceNumber > choices.length) {
    return choiceFailure(
      "choice-out-of-range",
      `Choice ${String(choiceNumber)} is unavailable. Enter a number from 1 to ${String(choices.length)}.`,
    );
  }

  const choice = choices[choiceNumber - 1];
  if (choice === undefined) {
    return choiceFailure(
      "invalid-active-view",
      "Active story view must contain valid, uniquely identified choices.",
    );
  }

  return Object.freeze({
    ok: true,
    choiceId: choice.id,
    choiceNumber,
  });
}

export async function requestStoryChoice(
  input: LineInput,
  view: ActiveStoryView,
  options: RequestStoryChoiceOptions = {},
): Promise<RequestStoryChoiceResult> {
  if (options.signal?.aborted === true) {
    return Object.freeze({ status: "cancelled" });
  }

  const readResult = await input.readLine({
    prompt: options.prompt ?? DEFAULT_CHOICE_PROMPT,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  switch (readResult.status) {
    case "line": {
      const selection = selectChoiceFromLine(view, readResult.value);
      if (!selection.ok) {
        return Object.freeze({
          status: "invalid",
          code: selection.code,
          message: selection.message,
        });
      }
      return Object.freeze({
        status: "selected",
        choiceId: selection.choiceId,
        choiceNumber: selection.choiceNumber,
      });
    }
    case "eof":
      return Object.freeze({ status: "eof" });
    case "cancelled":
      return Object.freeze({ status: "cancelled" });
  }
}

interface ValidChoice {
  readonly id: string;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function validateActiveChoices(
  suppliedView: ActiveStoryView,
): readonly ValidChoice[] | undefined {
  const view: unknown = suppliedView;
  if (!isRecord(view) || view["status"] !== "active") {
    return undefined;
  }

  const suppliedChoices = view["choices"];
  if (!Array.isArray(suppliedChoices) || suppliedChoices.length === 0) {
    return undefined;
  }

  const ids = new Set<string>();
  const choices: ValidChoice[] = [];
  for (const suppliedChoice of suppliedChoices) {
    if (!isRecord(suppliedChoice)) {
      return undefined;
    }

    const id = suppliedChoice["id"];
    const label = suppliedChoice["label"];
    if (
      !isNonEmptyString(id) ||
      !isNonEmptyString(label) ||
      label.includes("\n") ||
      label.includes("\r") ||
      ids.has(id)
    ) {
      return undefined;
    }

    ids.add(id);
    choices.push({ id });
  }

  return choices;
}

function invalidNumber(value: string): ChoiceSelectionResult {
  return choiceFailure(
    "invalid-number",
    `${JSON.stringify(value)} is not a valid choice number.`,
  );
}

function choiceFailure(
  code: ChoiceInputErrorCode,
  message: string,
): ChoiceSelectionResult {
  return Object.freeze({ ok: false, code, message });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
