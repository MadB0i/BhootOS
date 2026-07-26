import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { NodeLineInput } from "../src/input/line-input.js";

interface StreamHarness {
  readonly input: PassThrough;
  readonly output: PassThrough;
  readonly adapter: NodeLineInput;
  readonly outputChunks: string[];
}

function createHarness(): StreamHarness {
  const input = new PassThrough();
  const output = new PassThrough();
  const outputChunks: string[] = [];
  output.on("data", (chunk: Buffer) => {
    outputChunks.push(chunk.toString("utf8"));
  });

  return {
    input,
    output,
    adapter: new NodeLineInput({ input, output }),
    outputChunks,
  };
}

function inputListenerCounts(input: PassThrough): Record<string, number> {
  return {
    data: input.listenerCount("data"),
    end: input.listenerCount("end"),
    close: input.listenerCount("close"),
    error: input.listenerCount("error"),
  };
}

function outputErrorListenerCount(output: PassThrough): number {
  return output.listenerCount("error");
}

describe("NodeLineInput", () => {
  it("writes the supplied prompt exactly once", async () => {
    const harness = createHarness();
    const reading = harness.adapter.readLine({ prompt: "Pick: " });

    harness.input.write("1\n");

    await expect(reading).resolves.toEqual({
      status: "line",
      value: "1",
    });
    expect(harness.outputChunks).toEqual(["Pick: "]);
  });

  it("returns one entered line exactly", async () => {
    const harness = createHarness();
    const reading = harness.adapter.readLine();

    harness.input.write("  untrimmed input  \r\n");

    await expect(reading).resolves.toEqual({
      status: "line",
      value: "  untrimmed input  ",
    });
  });

  it("does not reinterpret content after the first line", async () => {
    const harness = createHarness();
    const first = harness.adapter.readLine();
    harness.input.write("first\nsecond\n");

    await expect(first).resolves.toEqual({
      status: "line",
      value: "first",
    });
    await expect(harness.adapter.readLine()).resolves.toEqual({
      status: "line",
      value: "second",
    });
  });

  it("returns EOF when input ends before a line", async () => {
    const harness = createHarness();
    const reading = harness.adapter.readLine();

    harness.input.end();

    await expect(reading).resolves.toEqual({ status: "eof" });
  });

  it("returns a final unterminated line before EOF", async () => {
    const harness = createHarness();
    const reading = harness.adapter.readLine();

    harness.input.end("last line");

    await expect(reading).resolves.toEqual({
      status: "line",
      value: "last line",
    });
    await expect(harness.adapter.readLine()).resolves.toEqual({
      status: "eof",
    });
  });

  it("returns cancelled when aborted while waiting", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    const reading = harness.adapter.readLine({
      prompt: "> ",
      signal: controller.signal,
    });

    controller.abort();

    await expect(reading).resolves.toEqual({ status: "cancelled" });
    expect(harness.outputChunks).toEqual(["> "]);
  });

  it("does not write a prompt or attach listeners when pre-cancelled", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    controller.abort();
    const inputBefore = inputListenerCounts(harness.input);
    const outputBefore = outputErrorListenerCount(harness.output);

    await expect(
      harness.adapter.readLine({
        prompt: "Never: ",
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(harness.outputChunks).toEqual([]);
    expect(inputListenerCounts(harness.input)).toEqual(inputBefore);
    expect(outputErrorListenerCount(harness.output)).toBe(outputBefore);
  });

  it("cleans up listeners after receiving a line", async () => {
    const harness = createHarness();
    const inputBefore = inputListenerCounts(harness.input);
    const outputBefore = outputErrorListenerCount(harness.output);
    const reading = harness.adapter.readLine();

    harness.input.write("line\n");
    await reading;

    expect(inputListenerCounts(harness.input)).toEqual(inputBefore);
    expect(outputErrorListenerCount(harness.output)).toBe(outputBefore);
  });

  it("cleans up listeners after EOF", async () => {
    const harness = createHarness();
    const inputBefore = inputListenerCounts(harness.input);
    const outputBefore = outputErrorListenerCount(harness.output);
    const reading = harness.adapter.readLine();

    harness.input.end();
    await reading;

    expect(inputListenerCounts(harness.input)).toEqual(inputBefore);
    expect(outputErrorListenerCount(harness.output)).toBe(outputBefore);
  });

  it("cleans up listeners and the abort handler after cancellation", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    const inputBefore = inputListenerCounts(harness.input);
    const outputBefore = outputErrorListenerCount(harness.output);
    const reading = harness.adapter.readLine({
      signal: controller.signal,
    });

    controller.abort();
    await reading;

    expect(inputListenerCounts(harness.input)).toEqual(inputBefore);
    expect(outputErrorListenerCount(harness.output)).toBe(outputBefore);
  });

  it("leaves caller-owned streams open and usable after a line", async () => {
    const harness = createHarness();
    const reading = harness.adapter.readLine();

    harness.input.write("line\n");
    await reading;
    harness.output.write("still open");
    harness.input.write("another\n");

    expect(harness.input.destroyed).toBe(false);
    expect(harness.output.destroyed).toBe(false);
    expect(harness.outputChunks).toEqual(["still open"]);
    await expect(harness.adapter.readLine()).resolves.toEqual({
      status: "line",
      value: "another",
    });
  });

  it("leaves caller-owned streams open after cancellation", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    const reading = harness.adapter.readLine({
      signal: controller.signal,
    });

    controller.abort();
    await reading;

    expect(harness.input.destroyed).toBe(false);
    expect(harness.output.destroyed).toBe(false);
    harness.output.write("usable");
    expect(harness.outputChunks).toEqual(["usable"]);
  });

  it("propagates an unexpected input stream error", async () => {
    const harness = createHarness();
    const failure = new Error("stream failed");
    const reading = harness.adapter.readLine();

    harness.input.emit("error", failure);

    await expect(reading).rejects.toBe(failure);
  });

  it("rejects concurrent reads without affecting the active read", async () => {
    const harness = createHarness();
    const first = harness.adapter.readLine();

    await expect(harness.adapter.readLine()).rejects.toThrow(
      "cannot read more than one line concurrently",
    );
    harness.input.write("first\n");
    await expect(first).resolves.toEqual({
      status: "line",
      value: "first",
    });
  });
});
