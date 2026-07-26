import { describe, expect, it } from "vitest";

import {
  formatChoice,
  formatNarrative,
  terminalContentWidth,
  visibleWidth,
} from "../src/terminal/layout.js";

describe("terminal story layout", () => {
  it("uses a restrained width with a narrow-terminal fallback", () => {
    expect(terminalContentWidth(undefined)).toBeUndefined();
    expect(terminalContentWidth(20)).toBe(28);
    expect(terminalContentWidth(60)).toBe(58);
    expect(terminalContentWidth(140)).toBe(88);
  });

  it("indents narrative lines while preserving paragraph breaks", () => {
    expect(formatNarrative("One short line.\n\nSecond paragraph.", 28)).toBe(
      "  One short line.\n\n  Second paragraph.",
    );
  });

  it("wraps choices under their label instead of the number", () => {
    const lines = formatChoice(
      2,
      "Read the unusually long note on the corridor frame",
      28,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toMatch(/^  2\. /u);
    expect(lines.slice(1).every((line) => line.startsWith("     "))).toBe(true);
    expect(lines.every((line) => visibleWidth(line) <= 28)).toBe(true);
  });

  it("measures ANSI styling by visible code points", () => {
    expect(visibleWidth("\u001b[31mKaun Hai?\u001b[0m")).toBe(9);
  });
});
