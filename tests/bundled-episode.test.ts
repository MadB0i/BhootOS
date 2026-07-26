import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveBundledEpisodePath } from "../src/cli/bundled-episode.js";

describe("bundled episode resolution", () => {
  it("resolves from the CLI module instead of the current working directory", () => {
    const packageRoot = join("C:", "packages", "bhootos");
    const cliUrl = pathToFileURL(join(packageRoot, "dist", "cli.js"));

    expect(resolveBundledEpisodePath(cliUrl)).toBe(
      join(packageRoot, "episodes", "kaun-hai", "story.json"),
    );
  });
});
