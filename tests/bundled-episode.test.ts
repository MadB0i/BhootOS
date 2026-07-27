import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveBundledEpisodePath } from "../src/cli/bundled-episode.js";

describe("bundled episode resolution", () => {
  it("resolves from the CLI module instead of the current working directory", () => {
    const packageRoot = join(tmpdir(), "bhootos-package");
    const cliUrl = pathToFileURL(join(packageRoot, "dist", "cli.js"));
    const resolvedEpisode = resolveBundledEpisodePath(cliUrl);

    expect(resolvedEpisode).toBe(
      join(packageRoot, "episodes", "kaun-hai", "story.json"),
    );
    expect(resolvedEpisode).not.toBe(
      join(process.cwd(), "episodes", "kaun-hai", "story.json"),
    );
  });
});
