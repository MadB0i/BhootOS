import { describe, it, expect, vi } from "vitest";
import { runApp, doctorReport } from "../src/app.js";
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";

function makeCaps(overrides: Partial<TerminalCapabilities> = {}): TerminalCapabilities {
  return {
    isInteractive: false,
    supportsColor: false,
    supportsUnicode: false,
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

describe("runApp", () => {
  it("boot content is present", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({ supportsUnicode: true }),
      fast: true,
    });

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toContain("BHOOT/OS");
    expect(output).toContain("Haunted Terminal Runtime");
    expect(output).toContain("Human processes detected: 1");
    expect(output).toContain("Unknown processes detected: 2");
    expect(output).toContain("Kaun hai wahan?");
  });

  it("Kaun hai wahan? appears exactly once", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({ supportsUnicode: true }),
      fast: true,
    });

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    const matches = output.match(/Kaun hai wahan\?/g);
    expect(matches).toHaveLength(1);
  });

  it("does not write to stderr on successful execution", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({ supportsUnicode: true }),
      fast: true,
    });

    expect(stderr).not.toHaveBeenCalled();
  });

  it("interactive mode requests animation delays", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();

    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({ isInteractive: true, supportsUnicode: true }),
      fast: false,
      scheduler: sched,
    });

    expect(sched.sleep).toHaveBeenCalled();
  });

  it("non-interactive mode requests no delays", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();

    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({ isInteractive: false, supportsUnicode: true }),
      fast: false,
      scheduler: sched,
    });

    expect(sched.sleep).not.toHaveBeenCalled();
  });

  it("reduced-motion requests no delays", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();

    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({
        isInteractive: true,
        supportsUnicode: true,
        reducedMotion: true,
      }),
      fast: false,
      scheduler: sched,
    });

    expect(sched.sleep).not.toHaveBeenCalled();
  });

  it("fast mode requests no delays", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const sched = fakeScheduler();

    await runApp({
      io: { stdout, stderr },
      capabilities: makeCaps({ isInteractive: true, supportsUnicode: true }),
      fast: true,
      scheduler: sched,
    });

    expect(sched.sleep).not.toHaveBeenCalled();
  });
});

describe("doctorReport", () => {
  it("prints all required fields", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    doctorReport({
      io: { stdout, stderr },
      capabilities: makeCaps({
        isInteractive: true,
        supportsColor: true,
        supportsUnicode: true,
        supportsTerminalControl: true,
        reducedMotion: true,
      }),
      platform: "win32",
      nodeVersion: "v20.0.0",
    });

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toContain("BhootOS Terminal Doctor");
    expect(output).toContain("Interactive: yes");
    expect(output).toContain("Color: yes");
    expect(output).toContain("Unicode: yes");
    expect(output).toContain("Terminal control: yes");
    expect(output).toContain("Reduced motion: yes");
    expect(output).toContain("Platform: win32");
    expect(output).toContain("Node: v20.0.0");
  });

  it("respects disabled capabilities in report", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    doctorReport({
      io: { stdout, stderr },
      capabilities: makeCaps({
        isInteractive: false,
        supportsColor: false,
        supportsUnicode: false,
        reducedMotion: false,
      }),
      platform: "linux",
      nodeVersion: "v22.0.0",
    });

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).toContain("Interactive: no");
    expect(output).toContain("Color: no");
    expect(output).toContain("Unicode: no");
    expect(output).toContain("Terminal control: no");
    expect(output).toContain("Reduced motion: no");
    expect(output).toContain("Platform: linux");
    expect(output).toContain("Node: v22.0.0");
  });

  it("does not include animation state", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    doctorReport({
      io: { stdout, stderr },
      capabilities: makeCaps({ isInteractive: false, supportsColor: false, supportsUnicode: false }),
      platform: "linux",
      nodeVersion: "v22.0.0",
    });

    const output = stdout.mock.calls.map(([s]: [string]) => s).join("");
    expect(output).not.toContain("Fast");
  });
});
