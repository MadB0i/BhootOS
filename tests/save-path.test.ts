import { describe, expect, it } from "vitest";

import { resolveBhootOsSavePath } from "../src/cli/save-path.js";

describe("resolveBhootOsSavePath", () => {
  it("uses LOCALAPPDATA on Windows", () => {
    expect(
      resolveBhootOsSavePath({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Data" },
        homeDirectory: "C:\\Users\\tester",
      }),
    ).toBe("C:\\Data\\BhootOS\\state.json");
  });

  it("uses Application Support on macOS", () => {
    expect(
      resolveBhootOsSavePath({
        platform: "darwin",
        env: {},
        homeDirectory: "/Users/tester",
      }),
    ).toBe("/Users/tester/Library/Application Support/BhootOS/state.json");
  });

  it("uses XDG_DATA_HOME or the Unix user-data fallback", () => {
    expect(
      resolveBhootOsSavePath({
        platform: "linux",
        env: { XDG_DATA_HOME: "/xdg" },
        homeDirectory: "/home/tester",
      }),
    ).toBe("/xdg/bhootos/state.json");
    expect(
      resolveBhootOsSavePath({
        platform: "linux",
        env: {},
        homeDirectory: "/home/tester",
      }),
    ).toBe("/home/tester/.local/share/bhootos/state.json");
  });
});
