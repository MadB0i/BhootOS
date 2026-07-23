import { describe, it, expect } from "vitest";
import { detectTerminalCapabilities } from "../src/terminal/capabilities.js";

describe("detectTerminalCapabilities", () => {
  it("normal interactive modern terminal", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: {},
      platform: "linux",
    });
    expect(caps.isInteractive).toBe(true);
    expect(caps.supportsColor).toBe(true);
    expect(caps.supportsUnicode).toBe(true);
    expect(caps.supportsTerminalControl).toBe(true);
    expect(caps.reducedMotion).toBe(false);
  });

  it("non-TTY output disables color", () => {
    const caps = detectTerminalCapabilities({
      isTTY: false,
      env: {},
      platform: "linux",
    });
    expect(caps.isInteractive).toBe(false);
    expect(caps.supportsColor).toBe(false);
    expect(caps.supportsTerminalControl).toBe(false);
  });

  it("NO_COLOR disables color", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: { NO_COLOR: "1" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(false);
  });

  it("empty NO_COLOR does not disable color", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: { NO_COLOR: "" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(true);
  });

  it("FORCE_COLOR=0 disables color", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: { FORCE_COLOR: "0" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(false);
  });

  it("non-zero FORCE_COLOR enables color even on non-TTY", () => {
    const caps = detectTerminalCapabilities({
      isTTY: false,
      env: { FORCE_COLOR: "1" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(true);
  });

  it("non-zero FORCE_COLOR on TTY enables color", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: { FORCE_COLOR: "2" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(true);
  });

  it("TERM=dumb disables color and unicode", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: { TERM: "dumb" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(false);
    expect(caps.supportsUnicode).toBe(false);
    expect(caps.supportsTerminalControl).toBe(false);
  });

  it("forceAscii disables unicode", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: {},
      platform: "linux",
      forceAscii: true,
    });
    expect(caps.supportsUnicode).toBe(false);
  });

  it("noColor: true disables color", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: {},
      platform: "linux",
      noColor: true,
    });
    expect(caps.supportsColor).toBe(false);
  });

  it("reducedMotion option works", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: {},
      platform: "linux",
      reducedMotion: true,
    });
    expect(caps.reducedMotion).toBe(true);
  });

  it("reducedMotion defaults to false", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: {},
      platform: "linux",
    });
    expect(caps.reducedMotion).toBe(false);
  });

  it("does not mutate input env object", () => {
    const env: Record<string, string | undefined> = { NO_COLOR: "1" };
    const original = { ...env };
    detectTerminalCapabilities({
      isTTY: true,
      env,
      platform: "linux",
    });
    expect(env).toEqual(original);
  });

  it("NO_COLOR takes precedence over FORCE_COLOR=1", () => {
    const caps = detectTerminalCapabilities({
      isTTY: true,
      env: { NO_COLOR: "1", FORCE_COLOR: "1" },
      platform: "linux",
    });
    expect(caps.supportsColor).toBe(false);
  });
});
