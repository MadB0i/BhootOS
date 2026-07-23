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
    expect(capture.stderr.join("")).toContain("too many arguments");
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
    const version = captureRuntime(["--version"]);

    expect(await runCli(help.runtime)).toBe(0);
    expect(help.stdout.join("")).toContain("Usage: bhootos");
    expect(await runCli(doctorHelp.runtime)).toBe(0);
    expect(doctorHelp.stdout.join("")).toContain("Global Options:");
    expect(doctorHelp.stdout.join("")).toContain("--no-color");
    expect(await runCli(version.runtime)).toBe(0);
    expect(version.stdout.join("")).toBe("0.1.0-test\n");
  });
});
