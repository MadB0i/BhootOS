import type { Readable } from "node:stream";

import { CancellationError } from "../terminal/scheduler.js";

export class AnimationSkipRequest extends Error {
  override readonly name = "AnimationSkipRequest";

  constructor() {
    super("Animation was skipped.");
  }
}

export interface AnimationSkipSession {
  readonly signal: AbortSignal;
  close(): void;
}

export interface AnimationSkipper {
  begin(): AnimationSkipSession | undefined;
}

interface RawInput extends Readable {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  setRawMode?(enabled: boolean): unknown;
}

export function createNodeAnimationSkipper(
  input: Readable,
  interrupt: () => void,
): AnimationSkipper {
  const rawInput = input as RawInput;
  return Object.freeze({
    begin(): AnimationSkipSession | undefined {
      if (rawInput.isTTY !== true || typeof rawInput.setRawMode !== "function") {
        return undefined;
      }
      return beginRawSkipSession(rawInput, interrupt);
    },
  });
}

function beginRawSkipSession(
  input: RawInput,
  interrupt: () => void,
): AnimationSkipSession {
  const controller = new AbortController();
  const wasRaw = input.isRaw === true;
  const wasFlowing = input.readableFlowing === true;
  let closed = false;

  const onData = (chunk: unknown): void => {
    const bytes =
      typeof chunk === "string"
        ? new TextEncoder().encode(chunk)
        : chunk instanceof Uint8Array
          ? chunk
          : undefined;
    if (bytes === undefined) {
      controller.abort(new TypeError("Terminal input emitted non-text data."));
      return;
    }
    if (bytes.includes(0x03)) {
      interrupt();
      controller.abort(new CancellationError());
      return;
    }
    if (bytes.includes(0x20) || bytes.includes(0x0a) || bytes.includes(0x0d)) {
      controller.abort(new AnimationSkipRequest());
    }
  };
  const onError = (error: Error): void => controller.abort(error);
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    input.removeListener("data", onData);
    input.removeListener("error", onError);
    if (!wasFlowing) {
      input.pause();
    }
    if (!wasRaw) {
      input.setRawMode?.(false);
    }
  };

  try {
    if (!wasRaw) {
      input.setRawMode?.(true);
    }
    input.on("data", onData);
    input.once("error", onError);
    input.resume();
  } catch (error: unknown) {
    close();
    throw error;
  }

  return Object.freeze({ signal: controller.signal, close });
}
