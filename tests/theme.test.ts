import { describe, expect, it } from "vitest";
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";
import { createTheme } from "../src/terminal/theme.js";

function capabilities(supportsColor: boolean): TerminalCapabilities {
  return {
    isInteractive: true,
    supportsColor,
    supportsUnicode: true,
    supportsTerminalControl: true,
    reducedMotion: false,
  };
}

describe("createTheme", () => {
  it("emits ANSI when injected capabilities enable color", () => {
    const themed = createTheme(capabilities(true)).danger("danger");

    expect(themed).toContain("\u001b[31m");
    expect(themed).toContain("danger");
  });

  it("emits plain text when injected capabilities disable color", () => {
    const theme = createTheme(capabilities(false));

    expect(theme.title("title")).toBe("title");
    expect(theme.danger("danger")).toBe("danger");
  });
});
