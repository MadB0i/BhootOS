import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createSafeOutput } from "../src/cli/safe-output.js";

class FakeOutput extends EventEmitter {
  readonly write = vi.fn((_text: string): boolean => true);
}

describe("safe CLI output", () => {
  it("handles asynchronous EPIPE without a stack trace or further writes", () => {
    const stream = new FakeOutput();
    const updateExitCode = vi.fn();
    const output = createSafeOutput(stream, updateExitCode);
    output.write("first");

    stream.emit("error", Object.assign(new Error("broken"), { code: "EPIPE" }));
    output.write("second");

    expect(output.isBrokenPipe()).toBe(true);
    expect(output.failure()).toBeUndefined();
    expect(stream.write).toHaveBeenCalledTimes(1);
    expect(updateExitCode).toHaveBeenCalledWith(0);
  });

  it("handles synchronous EPIPE as a clean closed pipe", () => {
    const stream = new FakeOutput();
    stream.write.mockImplementation(() => {
      throw Object.assign(new Error("broken"), { code: "EPIPE" });
    });
    const output = createSafeOutput(stream);

    expect(() => output.write("text")).not.toThrow();
    expect(output.isBrokenPipe()).toBe(true);
  });

  it("records asynchronous non-pipe failures", () => {
    const stream = new FakeOutput();
    const updateExitCode = vi.fn();
    const output = createSafeOutput(stream, updateExitCode);
    const failure = Object.assign(new Error("closed"), { code: "EIO" });

    stream.emit("error", failure);

    expect(output.failure()).toBe(failure);
    expect(output.isBrokenPipe()).toBe(false);
    expect(updateExitCode).toHaveBeenCalledWith(1);
  });
});
