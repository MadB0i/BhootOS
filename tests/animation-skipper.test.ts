import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  AnimationSkipRequest,
  createNodeAnimationSkipper,
} from "../src/input/animation-skipper.js";
import { CancellationError } from "../src/terminal/scheduler.js";

class FakeTtyInput extends PassThrough {
  readonly isTTY = true;
  isRaw = false;
  readonly rawModes: boolean[] = [];

  setRawMode(enabled: boolean): this {
    this.isRaw = enabled;
    this.rawModes.push(enabled);
    return this;
  }
}

describe("Node animation skipper", () => {
  it("activates only for a TTY with raw-mode support", () => {
    const nonTty = new PassThrough();
    expect(createNodeAnimationSkipper(nonTty, vi.fn()).begin()).toBeUndefined();
  });

  it.each([" ", "\r", "\n"])(
    "turns %j into a skip request and restores terminal state",
    (key) => {
      const input = new FakeTtyInput();
      const session = createNodeAnimationSkipper(input, vi.fn()).begin();
      expect(session).toBeDefined();
      expect(input.rawModes).toEqual([true]);

      input.write(key);
      expect(session?.signal.aborted).toBe(true);
      expect(session?.signal.reason).toBeInstanceOf(AnimationSkipRequest);

      session?.close();
      expect(input.rawModes).toEqual([true, false]);
      expect(input.listenerCount("data")).toBe(0);
      expect(input.listenerCount("error")).toBe(0);
      expect(input.isPaused()).toBe(true);
    },
  );

  it("swallows ordinary keys during animation without treating them as choices", () => {
    const input = new FakeTtyInput();
    const session = createNodeAnimationSkipper(input, vi.fn()).begin();
    input.write("1");
    expect(session?.signal.aborted).toBe(false);
    session?.close();
  });

  it("routes Ctrl+C through command cancellation and restores prior raw mode", () => {
    const input = new FakeTtyInput();
    input.isRaw = true;
    const interrupt = vi.fn();
    const session = createNodeAnimationSkipper(input, interrupt).begin();

    input.write(Uint8Array.of(0x03));
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(session?.signal.reason).toBeInstanceOf(CancellationError);
    session?.close();
    expect(input.rawModes).toEqual([]);
    expect(input.isRaw).toBe(true);
  });
});
