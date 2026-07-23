import { describe, expect, it, vi } from "vitest";
import { CancellationError } from "../src/terminal/scheduler.js";
import { Typewriter } from "../src/terminal/typewriter.js";

describe("Typewriter", () => {
  function fakeScheduler() {
    return {
      sleep: vi.fn().mockImplementation((_ms: number, signal?: AbortSignal) => {
        if (signal?.aborted === true) {
          return Promise.reject(new CancellationError());
        }
        return Promise.resolve();
      }),
    };
  }

  it("disabled mode writes once with zero sleeps", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("hello", { enabled: false });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("hello");
    expect(scheduler.sleep).not.toHaveBeenCalled();
  });

  it("animated mode writes each code point separately", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("abc", { enabled: true, characterDelayMs: 1 });

    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenNthCalledWith(1, "a");
    expect(write).toHaveBeenNthCalledWith(2, "b");
    expect(write).toHaveBeenNthCalledWith(3, "c");
  });

  it("preserves exact text", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("Hello, World!", {
      enabled: true,
      characterDelayMs: 1,
    });

    const output = write.mock.calls.map(([text]: [string]) => text).join("");
    expect(output).toBe("Hello, World!");
  });

  it("punctuation delay replaces the normal character delay", async () => {
    const write = vi.fn();
    const scheduler = {
      sleep: vi.fn().mockResolvedValue(undefined),
    };
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("a.b", {
      enabled: true,
      characterDelayMs: 10,
      punctuationDelayMs: 50,
    });

    expect(scheduler.sleep).toHaveBeenCalledTimes(2);
    expect(scheduler.sleep).toHaveBeenNthCalledWith(1, 10, undefined);
    expect(scheduler.sleep).toHaveBeenNthCalledWith(2, 50, undefined);
  });

  it("does not sleep after the final character", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("xyz", { enabled: true, characterDelayMs: 1 });

    expect(scheduler.sleep).toHaveBeenCalledTimes(2);
  });

  it("writes newline characters separately", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("a\nb", { enabled: true, characterDelayMs: 1 });

    expect(write).toHaveBeenNthCalledWith(1, "a");
    expect(write).toHaveBeenNthCalledWith(2, "\n");
    expect(write).toHaveBeenNthCalledWith(3, "b");
  });

  it("does not split Unicode code points", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });
    const emoji = "👋🌍";

    await typewriter.typewrite(emoji, { enabled: true, characterDelayMs: 1 });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, "👋");
    expect(write).toHaveBeenNthCalledWith(2, "🌍");
    expect(write.mock.calls.map(([text]: [string]) => text).join("")).toBe(emoji);
  });

  it("accepts zero delays", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await expect(
      typewriter.typewrite("test", {
        enabled: true,
        characterDelayMs: 0,
        punctuationDelayMs: 0,
      }),
    ).resolves.toBeUndefined();

    expect(write).toHaveBeenCalledTimes(4);
  });

  it("rejects negative character delay", async () => {
    const typewriter = new Typewriter({
      write: vi.fn(),
      scheduler: fakeScheduler(),
    });

    await expect(
      typewriter.typewrite("test", { characterDelayMs: -1 }),
    ).rejects.toThrow(TypeError);
  });

  it("rejects NaN delay", async () => {
    const typewriter = new Typewriter({
      write: vi.fn(),
      scheduler: fakeScheduler(),
    });

    await expect(
      typewriter.typewrite("test", { characterDelayMs: Number.NaN }),
    ).rejects.toThrow(TypeError);
  });

  it("rejects infinite delay", async () => {
    const typewriter = new Typewriter({
      write: vi.fn(),
      scheduler: fakeScheduler(),
    });

    await expect(
      typewriter.typewrite("test", {
        characterDelayMs: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow(TypeError);
  });

  it("cancellation stops at the exact write boundary", async () => {
    const write = vi.fn();
    const controller = new AbortController();
    const scheduler = {
      sleep: vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new CancellationError());
      }),
    };
    const typewriter = new Typewriter({ write, scheduler });

    await expect(
      typewriter.typewrite("abcde", {
        characterDelayMs: 10,
        signal: controller.signal,
      }),
    ).rejects.toThrow(CancellationError);

    expect(write.mock.calls.map(([text]: [string]) => text)).toEqual(["a"]);
  });

  it("propagates unrelated scheduler errors", async () => {
    const scheduler = {
      sleep: vi.fn().mockRejectedValue(new Error("scheduler failed")),
    };
    const typewriter = new Typewriter({ write: vi.fn(), scheduler });

    await expect(
      typewriter.typewrite("abc", { characterDelayMs: 1 }),
    ).rejects.toThrow("scheduler failed");
  });

  it("does not mutate its options", async () => {
    const typewriter = new Typewriter({
      write: vi.fn(),
      scheduler: fakeScheduler(),
    });
    const options = Object.freeze({
      enabled: true,
      characterDelayMs: 10,
      punctuationDelayMs: 50,
    });

    await expect(typewriter.typewrite("hi", options)).resolves.toBeUndefined();
  });

  it("empty text performs no writes or sleeps", async () => {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const typewriter = new Typewriter({ write, scheduler });

    await typewriter.typewrite("");

    expect(write).not.toHaveBeenCalled();
    expect(scheduler.sleep).not.toHaveBeenCalled();
  });

  it("pre-aborted animated output writes nothing", async () => {
    await expectPreAbortedWritesNothing({ enabled: true }, "animated");
  });

  it("pre-aborted disabled output writes nothing", async () => {
    await expectPreAbortedWritesNothing({ enabled: false }, "disabled");
  });

  it("pre-aborted single-character output writes nothing", async () => {
    await expectPreAbortedWritesNothing({}, "x");
  });

  async function expectPreAbortedWritesNothing(
    options: { readonly enabled?: boolean },
    text: string,
  ): Promise<void> {
    const write = vi.fn();
    const scheduler = fakeScheduler();
    const controller = new AbortController();
    controller.abort();
    const typewriter = new Typewriter({ write, scheduler });

    await expect(
      typewriter.typewrite(text, { ...options, signal: controller.signal }),
    ).rejects.toThrow(CancellationError);

    expect(write).not.toHaveBeenCalled();
    expect(scheduler.sleep).not.toHaveBeenCalled();
  }
});
