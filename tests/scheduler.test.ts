import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CancellationError,
  createScheduler,
  isCancellationError,
  SchedulerDelayError,
} from "../src/terminal/scheduler.js";

describe("Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("zero delay resolves without scheduling a timer", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");

    await expect(createScheduler().sleep(0)).resolves.toBeUndefined();

    expect(timer).not.toHaveBeenCalled();
  });

  it("negative delay resolves without scheduling a timer", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");

    await expect(createScheduler().sleep(-10)).resolves.toBeUndefined();

    expect(timer).not.toHaveBeenCalled();
  });

  it("already-aborted signal rejects with CancellationError", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createScheduler().sleep(100, controller.signal),
    ).rejects.toThrow(CancellationError);
  });

  it("active cancellation rejects and clears its timer", async () => {
    const controller = new AbortController();
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    const promise = createScheduler().sleep(1_000, controller.signal);

    controller.abort();

    await expect(promise).rejects.toThrow(CancellationError);
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancellation error is identifiable", () => {
    const error = new CancellationError();
    expect(isCancellationError(error)).toBe(true);
    expect(isCancellationError(new Error())).toBe(false);
    expect(isCancellationError("not an error")).toBe(false);
  });

  it("resolves when the timer completes", async () => {
    const promise = createScheduler().sleep(50);

    await vi.advanceTimersByTimeAsync(50);

    await expect(promise).resolves.toBeUndefined();
  });

  it("removes abort listener after completion", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const promise = createScheduler().sleep(5, controller.signal);

    await vi.advanceTimersByTimeAsync(5);
    await promise;

    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("removes abort listener after cancellation", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const promise = createScheduler().sleep(5, controller.signal);

    controller.abort();

    await expect(promise).rejects.toThrow(CancellationError);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not remove a listener when no signal is provided", async () => {
    const removeListener = vi.spyOn(
      AbortSignal.prototype,
      "removeEventListener",
    );
    const promise = createScheduler().sleep(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(removeListener).not.toHaveBeenCalled();
  });

  it("timeout followed by abort settles once as success", async () => {
    const controller = new AbortController();
    const promise = createScheduler().sleep(10, controller.signal);
    const fulfilled = vi.fn();
    const rejected = vi.fn();
    void promise.then(fulfilled, rejected);

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await promise;

    expect(fulfilled).toHaveBeenCalledTimes(1);
    expect(rejected).not.toHaveBeenCalled();
  });

  it("abort followed by timeout settles once as cancellation", async () => {
    const controller = new AbortController();
    const promise = createScheduler().sleep(10, controller.signal);
    const fulfilled = vi.fn();
    const rejected = vi.fn();
    void promise.then(fulfilled, rejected);

    controller.abort();
    await expect(promise).rejects.toThrow(CancellationError);
    await vi.advanceTimersByTimeAsync(10);

    expect(fulfilled).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite delay %s",
    async (delay) => {
      await expect(createScheduler().sleep(delay)).rejects.toThrow(
        SchedulerDelayError,
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
