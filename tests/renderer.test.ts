import { describe, it, expect, vi } from "vitest";
import { TerminalRenderer } from "../src/terminal/renderer.js";
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";

function makeCaps(overrides: Partial<TerminalCapabilities> = {}): TerminalCapabilities {
  return {
    isInteractive: false,
    supportsColor: true,
    supportsUnicode: true,
    supportsTerminalControl: false,
    reducedMotion: false,
    ...overrides,
  };
}

function fakeScheduler() {
  return {
    sleep: vi.fn().mockResolvedValue(undefined),
  };
}

describe("TerminalRenderer", () => {
  it("color-disabled output contains no ANSI codes", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ supportsColor: false, supportsUnicode: false }),
      stdout,
      stderr,
    });
    r.renderBootScreen();
    r.renderBootScreenFooter();
    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).not.toContain("\u001b[");
  });

  it("unicode mode uses unicode border characters", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ supportsColor: false, supportsUnicode: true }),
      stdout,
      stderr,
    });
    r.renderBootScreen();
    r.renderBootScreenFooter();
    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toContain("\u2554");
    expect(output).toContain("\u2557");
    expect(output).toContain("\u2551");
    expect(output).toContain("\u2550");
  });

  it("ascii mode contains no non-ASCII border characters", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ supportsColor: false, supportsUnicode: false }),
      stdout,
      stderr,
    });
    r.renderBootScreen();
    r.renderBootScreenFooter();
    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).not.toContain("\u2554");
    expect(output).not.toContain("\u2557");
    expect(output).not.toContain("\u255a");
    expect(output).not.toContain("\u255d");
    expect(output).not.toContain("\u2551");
    expect(output).not.toContain("\u2550");
  });

  it("boot screen contains system info without Kaun line", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ supportsColor: false, supportsUnicode: true }),
      stdout,
      stderr,
    });
    r.renderBootScreen();
    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toContain("BHOOT/OS");
    expect(output).toContain("Haunted Terminal Runtime");
    expect(output).toContain("Human processes detected: 1");
    expect(output).toContain("Unknown processes detected: 2");
    expect(output).not.toContain("Kaun hai wahan?");
  });

  it("writeLine adds exactly one newline", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps(),
      stdout,
      stderr,
    });
    r.writeLine("hello");
    expect(stdout).toHaveBeenCalledWith("hello\n");
  });

  it("writeLine with no argument adds just a newline", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps(),
      stdout,
      stderr,
    });
    r.writeLine();
    expect(stdout).toHaveBeenCalledWith("\n");
  });

  it("write does not add a newline", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps(),
      stdout,
      stderr,
    });
    r.write("hello");
    expect(stdout).toHaveBeenCalledWith("hello");
  });

  it("writeError uses stderr writer", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps(),
      stdout,
      stderr,
    });
    r.writeError("error msg");
    expect(stderr).toHaveBeenCalledWith("error msg\n");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("clear() emits nothing in non-interactive mode", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: false }),
      stdout,
      stderr,
    });
    r.clear();
    expect(stdout).not.toHaveBeenCalled();
  });

  it("clear() emits clear sequence in interactive mode", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true, supportsTerminalControl: true }),
      stdout,
      stderr,
    });
    r.clear();
    expect(stdout).toHaveBeenCalledWith("\u001b[2J\u001b[3J\u001b[H");
  });

  it("clear() emits nothing when terminal control is unsupported", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true, supportsTerminalControl: false }),
      stdout,
      stderr,
    });

    r.clear();

    expect(stdout).not.toHaveBeenCalled();
  });

  it("typewrite writes text via Typewriter with sleeps", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true }),
      stdout,
      stderr,
      scheduler: sched,
    });

    await r.typewrite("hi", { characterDelayMs: 1 });

    expect(sched.sleep).toHaveBeenCalled();
    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toBe("hi");
  });

  it("typewriteLine adds newline after successful output", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true }),
      stdout,
      stderr,
      scheduler: sched,
    });

    await r.typewriteLine("hi", { characterDelayMs: 1 });

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toBe("hi\n");
  });

  it("typewriteLine with no argument outputs just newline", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true }),
      stdout,
      stderr,
      scheduler: sched,
    });

    await r.typewriteLine(undefined, { characterDelayMs: 1 });

    expect(stdout).toHaveBeenCalledWith("\n");
  });

  it("no newline after cancellation", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const ac = new AbortController();
    const sched = {
      sleep: vi.fn().mockImplementation(() => {
        ac.abort();
        return Promise.reject(new Error("Cancelled"));
      }),
    };
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true }),
      stdout,
      stderr,
      scheduler: sched,
    });

    await expect(
      r.typewriteLine("hello", { signal: ac.signal, characterDelayMs: 10 }),
    ).rejects.toThrow();

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).not.toContain("\n");
  });

  it("non-interactive mode does not sleep", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: false }),
      stdout,
      stderr,
      scheduler: sched,
    });

    await r.typewrite("hello", { characterDelayMs: 10 });

    expect(sched.sleep).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("hello");
  });

  it("reduced-motion mode does not sleep", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true, reducedMotion: true }),
      stdout,
      stderr,
      scheduler: sched,
    });

    await r.typewrite("hello", { characterDelayMs: 10 });

    expect(sched.sleep).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("hello");
  });

  it("fast mode does not sleep", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();
    const r = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true }),
      stdout,
      stderr,
      scheduler: sched,
      fast: true,
    });

    await r.typewrite("hello", { characterDelayMs: 10 });

    expect(sched.sleep).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("hello");
  });

  it.each([
    ["non-interactive", { isInteractive: false }],
    ["reduced-motion", { isInteractive: true, reducedMotion: true }],
  ])("pre-aborted %s output writes nothing", async (_name, overrides) => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const scheduler = fakeScheduler();
    const controller = new AbortController();
    controller.abort();
    const renderer = new TerminalRenderer({
      capabilities: makeCaps(overrides),
      stdout,
      stderr,
      scheduler,
    });

    await expect(
      renderer.typewriteLine("hello", { signal: controller.signal }),
    ).rejects.toThrow("cancelled");

    expect(stdout).not.toHaveBeenCalled();
    expect(scheduler.sleep).not.toHaveBeenCalled();
  });

  it("pre-aborted fast output writes nothing", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const scheduler = fakeScheduler();
    const controller = new AbortController();
    controller.abort();
    const renderer = new TerminalRenderer({
      capabilities: makeCaps({ isInteractive: true }),
      stdout,
      stderr,
      scheduler,
      fast: true,
    });

    await expect(
      renderer.typewriteLine("hello", { signal: controller.signal }),
    ).rejects.toThrow("cancelled");

    expect(stdout).not.toHaveBeenCalled();
  });

  it.each([
    ["plain ASCII", false, false],
    ["plain Unicode", true, false],
    ["styled ASCII", false, true],
    ["styled Unicode", true, true],
  ])(
    "%s frame lines keep equal visible width",
    (_name, supportsUnicode, supportsColor) => {
      const stdout = vi.fn();
      const stderr = vi.fn();
      const renderer = new TerminalRenderer({
        capabilities: makeCaps({ supportsUnicode, supportsColor }),
        stdout,
        stderr,
      });

      renderer.renderBootScreen();
      renderer.renderBootScreenFooter();

      const lines = stdout.mock.calls
        .map(([text]: [string]) => text)
        .join("")
        .trimEnd()
        .split("\n");
      const visibleWidths = lines.map((line) => stripAnsi(line).length);

      expect(new Set(visibleWidths)).toEqual(new Set([50]));
      expect(lines.some((line) => line.includes("BHOOT/OS"))).toBe(true);
      expect(lines.some((line) => line.includes("Human processes detected"))).toBe(true);
      expect(lines.some((line) => line.includes("Unknown processes detected"))).toBe(true);
    },
  );
});

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}
