import { describe, expect, it, vi } from "vitest";
import { runCli, type CliRuntime } from "../src/cli-program.js";

function captureRuntime(
  argv: readonly string[],
  overrides: Partial<CliRuntime> = {},
): {
  readonly runtime: CliRuntime;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    runtime: {
      argv: ["node", "bhootos", ...argv],
      version: "0.1.0-test",
      isTTY: false,
      env: {},
      platform: "linux",
      nodeVersion: "v20.0.0",
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
      playStory: async () => 0,
      addSigintListener: () => undefined,
      removeSigintListener: () => undefined,
      ...overrides,
    },
  };
}

describe("runCli", () => {
  it.each([
    ["before", ["--no-color", "doctor"]],
    ["after", ["doctor", "--no-color"]],
  ])("honors --no-color %s doctor with forced color", async (_position, argv) => {
    const capture = captureRuntime(argv, {
      env: { FORCE_COLOR: "1" },
    });

    const exitCode = await runCli(capture.runtime);
    const output = capture.stdout.join("");

    expect(exitCode).toBe(0);
    expect(output).toContain("Color: no");
    expect(output).not.toContain("\u001b[");
  });

  it("accepts all global flags before and after doctor", async () => {
    const before = captureRuntime([
      "--no-color",
      "--ascii",
      "--reduced-motion",
      "--fast",
      "doctor",
    ]);
    const after = captureRuntime([
      "doctor",
      "--no-color",
      "--ascii",
      "--reduced-motion",
      "--fast",
    ]);

    expect(await runCli(before.runtime)).toBe(0);
    expect(await runCli(after.runtime)).toBe(0);
    expect(before.stdout.join("")).toBe(after.stdout.join(""));
    expect(before.stdout.join("")).toContain("Unicode: no");
    expect(before.stdout.join("")).toContain("Reduced motion: yes");
  });

  it("rejects unsupported root positional arguments", async () => {
    const capture = captureRuntime(["bogus"]);

    const exitCode = await runCli(capture.runtime);

    expect(exitCode).not.toBe(0);
    expect(capture.stderr.join("")).toMatch(/unknown command|too many arguments/);
  });

  it("rejects unsupported doctor positional arguments", async () => {
    const capture = captureRuntime(["doctor", "bogus"]);

    const exitCode = await runCli(capture.runtime);

    expect(exitCode).not.toBe(0);
    expect(capture.stderr.join("")).toContain("too many arguments");
  });

  it("catches asynchronous action failures once at the CLI boundary", async () => {
    const stderr: string[] = [];
    const failingWrite = vi.fn(() => {
      throw new Error("write failed");
    });
    const capture = captureRuntime(["--fast"], {
      stdout: failingWrite,
      stderr: (text) => stderr.push(text),
    });

    const exitCode = await runCli(capture.runtime);

    expect(exitCode).toBe(1);
    expect(failingWrite).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual(["bhootos: write failed\n"]);
  });

  it("preserves help and version without process exit", async () => {
    const help = captureRuntime(["--help"]);
    const doctorHelp = captureRuntime(["doctor", "--help"]);
    const playHelp = captureRuntime(["play", "--help"]);
    const version = captureRuntime(["--version"]);

    expect(await runCli(help.runtime)).toBe(0);
    expect(help.stdout.join("")).toContain("Usage: bhootos");
    expect(help.stdout.join("")).toContain("doctor");
    expect(help.stdout.join("")).toContain("play");
    expect(await runCli(doctorHelp.runtime)).toBe(0);
    expect(doctorHelp.stdout.join("")).toContain("Global Options:");
    expect(doctorHelp.stdout.join("")).toContain("--no-color");
    expect(await runCli(playHelp.runtime)).toBe(0);
    expect(playHelp.stdout.join("")).toContain("<story-file>");
    expect(playHelp.stdout.join("")).toContain(
      "play a story from an explicit JSON file",
    );
    expect(playHelp.stdout.join("")).toContain("Global Options:");
    expect(await runCli(version.runtime)).toBe(0);
    expect(version.stdout.join("")).toBe("0.1.0-test\n");
  });

  it.each([
    ["before", ["--no-color", "--ascii", "--reduced-motion", "--fast", "play", "story.json"]],
    ["after", ["play", "story.json", "--no-color", "--ascii", "--reduced-motion", "--fast"]],
  ])("forwards global options %s play", async (_position, argv) => {
    const playStory = vi.fn(async () => 0);
    const capture = captureRuntime(argv, {
      isTTY: true,
      env: { FORCE_COLOR: "1" },
      playStory,
    });

    expect(await runCli(capture.runtime)).toBe(0);
    expect(playStory).toHaveBeenCalledTimes(1);
    expect(playStory).toHaveBeenCalledWith(
      "story.json",
      expect.objectContaining({
        capabilities: expect.objectContaining({
          supportsColor: false,
          supportsUnicode: false,
          reducedMotion: true,
        }),
        fast: true,
      }),
    );
  });

  it.each([
    [[], /required argument 'story-file'/],
    [["story.json", "extra.json"], /too many arguments/],
    [["story.json", "--unknown"], /unknown option/],
  ])("rejects invalid play arguments: %j", async (args, message) => {
    const playStory = vi.fn(async () => 0);
    const capture = captureRuntime(["play", ...args], { playStory });

    expect(await runCli(capture.runtime)).toBe(1);
    expect(capture.stderr.join("")).toMatch(message);
    expect(playStory).not.toHaveBeenCalled();
  });

  it("aborts on SIGINT and removes the temporary listener", async () => {
    let sigintListener: (() => void) | undefined;
    const addSigintListener = vi.fn((listener: () => void) => {
      sigintListener = listener;
    });
    const removeSigintListener = vi.fn();
    const playStory = vi.fn(
      async (_sourceName: string, options: { readonly signal: AbortSignal }) => {
        expect(options.signal.aborted).toBe(false);
        sigintListener?.();
        sigintListener?.();
        expect(options.signal.aborted).toBe(true);
        return 130;
      },
    );
    const capture = captureRuntime(["play", "story.json"], {
      playStory,
      addSigintListener,
      removeSigintListener,
    });

    expect(await runCli(capture.runtime)).toBe(130);
    expect(addSigintListener).toHaveBeenCalledTimes(1);
    expect(removeSigintListener).toHaveBeenCalledTimes(1);
    expect(removeSigintListener).toHaveBeenCalledWith(sigintListener);
  });

  it("removes the SIGINT listener when play rejects", async () => {
    const listeners = new Set<() => void>();
    const capture = captureRuntime(["play", "story.json"], {
      playStory: async () => {
        throw new Error("play failed");
      },
      addSigintListener: (listener) => listeners.add(listener),
      removeSigintListener: (listener) => listeners.delete(listener),
    });

    expect(await runCli(capture.runtime)).toBe(1);
    expect(listeners.size).toBe(0);
    expect(capture.stderr).toEqual(["bhootos: play failed\n"]);
  });

  it("does not leak SIGINT listeners across sequential play calls", async () => {
    const listeners = new Set<() => void>();
    const runtimeOverrides: Partial<CliRuntime> = {
      playStory: async () => 0,
      addSigintListener: (listener) => listeners.add(listener),
      removeSigintListener: (listener) => listeners.delete(listener),
    };

    expect(
      await runCli(captureRuntime(["play", "one.json"], runtimeOverrides).runtime),
    ).toBe(0);
    expect(listeners.size).toBe(0);
    expect(
      await runCli(captureRuntime(["play", "two.json"], runtimeOverrides).runtime),
    ).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it.each([0, 2, 3, 4, 5, 130])(
    "removes the SIGINT listener after play returns %i",
    async (playExitCode) => {
      const listeners = new Set<() => void>();
      const capture = captureRuntime(["play", "story.json"], {
        playStory: async () => playExitCode,
        addSigintListener: (listener) => listeners.add(listener),
        removeSigintListener: (listener) => listeners.delete(listener),
      });

      expect(await runCli(capture.runtime)).toBe(playExitCode);
      expect(listeners.size).toBe(0);
    },
  );
});
