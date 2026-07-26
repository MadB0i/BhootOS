import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createStoryCommand,
  type AuthorFileSystem,
  validateStoryCommand,
} from "../src/cli/author-runtime.js";
import { loadStory } from "../src/story/load-story.js";
import { createNodeStoryFileReader } from "../src/story/node-file-reader.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bhootos-author-"));
  temporaryDirectories.push(directory);
  return directory;
}

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    value: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
  };
}

describe("validateStoryCommand", () => {
  it("reports deterministic facts for v1 and v2 stories", async () => {
    const captured = output();
    const exitCode = await validateStoryCommand(
      "episodes/kaun-hai/story.json",
      captured.value,
    );

    expect(exitCode).toBe(0);
    expect(captured.stdout.join("")).toBe(
      "Valid BhootOS story\nSchema: 2\nNodes: 23\nEndings: 4\n",
    );
    expect(captured.stderr).toEqual([]);
  });

  it("reports ordered diagnostics without ANSI and does not modify the file", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "broken.json");
    const original = '{"schemaVersion":2}';
    await writeFile(path, original, "utf8");
    const captured = output();

    expect(await validateStoryCommand(path, captured.value)).toBe(2);
    expect(captured.stderr.join("")).toContain("[invalid-document-structure]");
    expect(captured.stderr.join("")).not.toContain("\u001b[");
    await expect(readFile(path, "utf8")).resolves.toBe(original);
  });
});

describe("createStoryCommand", () => {
  it("creates a small valid and immediately playable v2 project", async () => {
    const directory = await temporaryDirectory();
    const captured = output();

    expect(
      await createStoryCommand("haunted-station", directory, captured.value),
    ).toBe(0);
    const storyPath = join(directory, "haunted-station", "story.json");
    const loaded = await loadStory(createNodeStoryFileReader(), storyPath);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.story).toMatchObject({
        schemaVersion: 2,
        id: "haunted-station",
        entryNodeId: "start",
      });
    }
    await expect(
      readFile(join(directory, "haunted-station", "README.md"), "utf8"),
    ).resolves.toContain("bhootos validate ./story.json");
  });

  it.each(["../escape", "two//levels", "C:\\absolute", "-leading", "Upper"])(
    "rejects unsafe or noncanonical name %s",
    async (name) => {
      const directory = await temporaryDirectory();
      const captured = output();
      expect(await createStoryCommand(name, directory, captured.value)).toBe(8);
      expect(captured.stderr.join("")).toContain("Story name must");
    },
  );

  it("refuses an existing destination without changing its files", async () => {
    const directory = await temporaryDirectory();
    const captured = output();
    expect(await createStoryCommand("station", directory, captured.value)).toBe(0);
    const storyPath = join(directory, "station", "story.json");
    const original = await readFile(storyPath, "utf8");

    expect(await createStoryCommand("station", directory, captured.value)).toBe(9);
    await expect(readFile(storyPath, "utf8")).resolves.toBe(original);
  });

  it("does not delete a file created concurrently during cleanup", async () => {
    const captured = output();
    const files = new Map<string, string>();
    const unlinked: string[] = [];
    const fileSystem: AuthorFileSystem = {
      mkdir: async () => undefined,
      writeFile: async (path, data) => {
        if (path.endsWith("README.md")) {
          files.set(path, "concurrent writer");
          throw Object.assign(new Error("exists"), { code: "EEXIST" });
        }
        files.set(path, data);
      },
      unlink: async (path) => {
        unlinked.push(path);
        files.delete(path);
      },
      rmdir: async () => {
        throw Object.assign(new Error("not empty"), { code: "ENOTEMPTY" });
      },
    };

    expect(
      await createStoryCommand(
        "concurrent-story",
        "C:\\safe",
        captured.value,
        fileSystem,
      ),
    ).toBe(9);

    const readmePath = [...files.keys()].find((path) =>
      path.endsWith("README.md"),
    );
    expect(readmePath).toBeDefined();
    expect(readmePath === undefined ? undefined : files.get(readmePath)).toBe(
      "concurrent writer",
    );
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0]).toMatch(/story\.json$/u);
  });
});
