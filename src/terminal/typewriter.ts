import { CancellationError, type Scheduler } from "./scheduler.js";
import { AnimationSkipRequest } from "../input/animation-skipper.js";

export const DEFAULT_CHARACTER_DELAY_MS = 28;
export const DEFAULT_PUNCTUATION_DELAY_MS = 120;

const PUNCTUATION = new Set([".", ",", "!", "?", ":", ";"]);

export interface TypewriterDeps {
  write: (text: string) => void;
  scheduler: Scheduler;
}

export interface TypewriterOptions {
  characterDelayMs?: number;
  /** Delay after punctuation, used instead of characterDelayMs. */
  punctuationDelayMs?: number;
  enabled?: boolean;
  signal?: AbortSignal;
  skipSignal?: AbortSignal;
}

export class TypewriterError extends TypeError {
  override readonly name = "TypewriterError";

  constructor(message: string) {
    super(message);
  }
}

function assertFiniteNonNegative(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypewriterError(
      `${name} must be a finite non-negative number, got ${String(value)}`,
    );
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new CancellationError();
  }
}

export class Typewriter {
  private write: (text: string) => void;
  private scheduler: Scheduler;

  constructor(deps: TypewriterDeps) {
    this.write = deps.write;
    this.scheduler = deps.scheduler;
  }

  async typewrite(text: string, options: TypewriterOptions = {}): Promise<void> {
    const characterDelayMs = options.characterDelayMs ?? DEFAULT_CHARACTER_DELAY_MS;
    const punctuationDelayMs = options.punctuationDelayMs ?? DEFAULT_PUNCTUATION_DELAY_MS;
    const enabled = options.enabled ?? true;
    const signal = options.signal;
    const skipSignal = options.skipSignal;

    assertFiniteNonNegative(characterDelayMs, "characterDelayMs");
    assertFiniteNonNegative(punctuationDelayMs, "punctuationDelayMs");

    throwIfAborted(signal);

    const chars = [...text];

    if (chars.length === 0) {
      return;
    }

    if (!enabled) {
      this.write(text);
      return;
    }

    for (const [index, char] of chars.entries()) {
      throwIfAborted(signal);

      this.write(char);

      if (index < chars.length - 1) {
        if (isAbortedSignal(skipSignal)) {
          finishSkippedAnimation(skipSignal, chars, index, this.write);
          return;
        }
        const delay = PUNCTUATION.has(char) ? punctuationDelayMs : characterDelayMs;
        try {
          await sleepWithSkip(this.scheduler, delay, signal, skipSignal);
        } catch (error: unknown) {
          if (isAbortedSignal(skipSignal)) {
            finishSkippedAnimation(skipSignal, chars, index, this.write);
            return;
          }
          throw error;
        }
      }
    }
  }
}

function isAbortedSignal(signal: AbortSignal | undefined): signal is AbortSignal {
  return signal?.aborted === true;
}

async function sleepWithSkip(
  scheduler: Scheduler,
  delay: number,
  signal: AbortSignal | undefined,
  skipSignal: AbortSignal | undefined,
): Promise<void> {
  if (skipSignal === undefined) {
    await scheduler.sleep(delay, signal);
    return;
  }
  const combined = new AbortController();
  const onAbort = (): void => combined.abort(new CancellationError());
  const onSkip = (): void => combined.abort(skipSignal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  skipSignal.addEventListener("abort", onSkip, { once: true });
  if (signal?.aborted === true) {
    onAbort();
  } else if (skipSignal.aborted) {
    onSkip();
  }
  try {
    await scheduler.sleep(delay, combined.signal);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    skipSignal.removeEventListener("abort", onSkip);
  }
}

function finishSkippedAnimation(
  skipSignal: AbortSignal,
  chars: readonly string[],
  index: number,
  write: (text: string) => void,
): void {
  if (!(skipSignal.reason instanceof AnimationSkipRequest)) {
    throw skipSignal.reason instanceof Error
      ? skipSignal.reason
      : new Error("Animation input failed.");
  }
  write(chars.slice(index + 1).join(""));
}
