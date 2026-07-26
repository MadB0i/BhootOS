import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { relative, resolve, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadStory } from "../src/index.js";
import {
  createNodeStoryFileReader,
  type NodeStoryFileSystem,
} from "../src/story/node-file-reader.js";

async function withTemporaryDirectory<T>(
  callback: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(
    join(resolve("."), ".bhootos-story-loader-"),
  );
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function stats(size: number, isFile = true) {
  return {
    size,
    isFile: () => isFile,
  };
}

function errorWithCode(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code });
}

describe("Node story file reader", () => {
  it("reads a valid UTF-8 file and preserves Unicode exactly", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "unicode.json");
      const text = '{"text":"दरवाज़ा खुला है 👻"}\n';
      await writeFile(path, text, "utf8");
      const reader = createNodeStoryFileReader();

      const result = await reader.read(path);

      expect(result).toEqual({
        ok: true,
        sourceName: path,
        text,
        byteLength: Buffer.byteLength(text, "utf8"),
      });
    });
  });

  it("preserves Windows line endings and a final line without newline", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "windows.json");
      const text = "{\r\n  \"value\": true\r\n}";
      await writeFile(path, text, "utf8");

      const result = await createNodeStoryFileReader().read(path);

      expect(result).toMatchObject({ ok: true, text });
    });
  });

  it("returns an empty file unchanged for the parser to handle", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "empty.json");
      await writeFile(path, new Uint8Array());

      const result = await createNodeStoryFileReader().read(path);

      expect(result).toEqual({
        ok: true,
        sourceName: path,
        text: "",
        byteLength: 0,
      });

      const loaded = await loadStory(
        createNodeStoryFileReader(),
        path,
      );
      expect(loaded).toMatchObject({
        ok: false,
        stage: "parse",
        code: "invalid-json",
        sourceName: path,
        diagnostics: [{ code: "invalid-json", path: "$" }],
      });
    });
  });

  it("returns file-not-found for a missing path", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "missing.json");

      const result = await createNodeStoryFileReader().read(path);

      expect(result).toEqual({
        ok: false,
        code: "file-not-found",
        sourceName: path,
        message: `Story file was not found: ${path}`,
      });
    });
  });

  it("rejects a directory path", async () => {
    await withTemporaryDirectory(async (directory) => {
      const result = await createNodeStoryFileReader().read(directory);

      expect(result).toEqual({
        ok: false,
        code: "not-a-file",
        sourceName: directory,
        message: `Story source is not a file: ${directory}`,
      });
    });
  });

  it("maps stable permission errors", async () => {
    const fileSystem: NodeStoryFileSystem = {
      stat: () => Promise.reject(errorWithCode("EACCES")),
      readFile: vi.fn(),
    };

    const result = await createNodeStoryFileReader(fileSystem).read(
      "private.json",
    );

    expect(result).toEqual({
      ok: false,
      code: "permission-denied",
      sourceName: "private.json",
      message: "Permission was denied reading story file: private.json",
    });
  });

  it("accepts a file exactly equal to the byte limit", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "exact.txt");
      await writeFile(path, "12345", "utf8");

      const result = await createNodeStoryFileReader().read(path, {
        maxBytes: 5,
      });

      expect(result).toMatchObject({
        ok: true,
        text: "12345",
        byteLength: 5,
      });
    });
  });

  it("rejects a file one byte over the metadata limit without reading", async () => {
    const readFileSpy: NodeStoryFileSystem["readFile"] = vi.fn(
      () => Promise.resolve(new Uint8Array()),
    );
    const fileSystem: NodeStoryFileSystem = {
      stat: () => Promise.resolve(stats(6)),
      readFile: readFileSpy,
    };

    const result = await createNodeStoryFileReader(fileSystem).read(
      "large.json",
      { maxBytes: 5 },
    );

    expect(result).toEqual({
      ok: false,
      code: "file-too-large",
      sourceName: "large.json",
      message: "Story source exceeds the 5-byte limit.",
    });
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("verifies actual byte length after reading", async () => {
    const fileSystem: NodeStoryFileSystem = {
      stat: () => Promise.resolve(stats(4)),
      readFile: () =>
        Promise.resolve(new TextEncoder().encode("123456")),
    };

    const result = await createNodeStoryFileReader(fileSystem).read(
      "raced.json",
      { maxBytes: 5 },
    );

    expect(result).toEqual({
      ok: false,
      code: "file-too-large",
      sourceName: "raced.json",
      message: "Story source exceeds the 5-byte limit.",
    });
  });

  it("rejects malformed UTF-8 without replacement characters", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "invalid.json");
      await writeFile(path, new Uint8Array([0xc3, 0x28]));

      const result = await createNodeStoryFileReader().read(path);

      expect(result).toEqual({
        ok: false,
        code: "invalid-utf8",
        sourceName: path,
        message: "Story file is not valid UTF-8.",
      });
    });
  });

  it("accepts and strips one leading UTF-8 BOM", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "bom.json");
      const content = new TextEncoder().encode('{"valid":true}');
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...content]);
      await writeFile(path, bytes);

      const result = await createNodeStoryFileReader().read(path);

      expect(result).toEqual({
        ok: true,
        sourceName: path,
        text: '{"valid":true}',
        byteLength: bytes.byteLength,
      });
    });
  });

  it("accepts relative paths without normalizing the source name", async () => {
    await withTemporaryDirectory(async (directory) => {
      const absolutePath = join(directory, "relative.json");
      const relativePath = relative(resolve("."), absolutePath);
      await writeFile(absolutePath, "{}", "utf8");

      const result = await createNodeStoryFileReader().read(relativePath);

      expect(result).toMatchObject({
        ok: true,
        sourceName: relativePath,
        text: "{}",
      });
    });
  });

  it("accepts absolute paths", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = resolve(directory, "absolute.json");
      await writeFile(path, "{}", "utf8");

      const result = await createNodeStoryFileReader().read(path);

      expect(result).toMatchObject({
        ok: true,
        sourceName: path,
      });
    });
  });

  it("follows a symbolic link to a regular file when supported", async (context) => {
    await withTemporaryDirectory(async (directory) => {
      const target = join(directory, "target.json");
      const link = join(directory, "link.json");
      await writeFile(target, '{"linked":true}', "utf8");
      try {
        await symlink(target, link, "file");
      } catch (error: unknown) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined;
        if (
          code === "EPERM" ||
          code === "EACCES" ||
          code === "ENOSYS"
        ) {
          context.skip();
          return;
        }
        throw error;
      }

      const result = await createNodeStoryFileReader().read(link);

      expect(result).toMatchObject({
        ok: true,
        sourceName: link,
        text: '{"linked":true}',
      });
    });
  });

  it("rejects empty and whitespace-only paths without filesystem work", async () => {
    const fileSystem: NodeStoryFileSystem = {
      stat: vi.fn(),
      readFile: vi.fn(),
    };
    const reader = createNodeStoryFileReader(fileSystem);

    await expect(reader.read("")).resolves.toMatchObject({
      ok: false,
      code: "invalid-source",
      sourceName: "",
    });
    await expect(reader.read(" \t ")).resolves.toMatchObject({
      ok: false,
      code: "invalid-source",
      sourceName: " \t ",
    });
    expect(fileSystem.stat).not.toHaveBeenCalled();
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid maxBytes %s without filesystem work",
    async (maxBytes) => {
      const fileSystem: NodeStoryFileSystem = {
        stat: vi.fn(),
        readFile: vi.fn(),
      };

      const result = await createNodeStoryFileReader(fileSystem).read(
        "story.json",
        { maxBytes },
      );

      expect(result).toMatchObject({
        ok: false,
        code: "invalid-options",
      });
      expect(fileSystem.stat).not.toHaveBeenCalled();
    },
  );

  it("performs no filesystem work for a pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fileSystem: NodeStoryFileSystem = {
      stat: vi.fn(),
      readFile: vi.fn(),
    };

    const result = await createNodeStoryFileReader(fileSystem).read(
      "story.json",
      { signal: controller.signal },
    );

    expect(result).toMatchObject({
      ok: false,
      code: "read-cancelled",
    });
    expect(fileSystem.stat).not.toHaveBeenCalled();
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it("returns cancellation while a read is pending", async () => {
    const controller = new AbortController();
    let announceRead: (() => void) | undefined;
    const readStarted = new Promise<void>((resolveStarted) => {
      announceRead = resolveStarted;
    });
    const fileSystem: NodeStoryFileSystem = {
      stat: () => Promise.resolve(stats(1)),
      readFile: () => {
        announceRead?.();
        return new Promise<Uint8Array>(() => undefined);
      },
    };
    const reading = createNodeStoryFileReader(fileSystem).read(
      "story.json",
      { signal: controller.signal },
    );

    await readStarted;
    controller.abort();

    await expect(reading).resolves.toEqual({
      ok: false,
      code: "read-cancelled",
      sourceName: "story.json",
      message: "Story file reading was cancelled.",
    });
  });

  it("does not mutate the source, options, or file", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "stable.json");
      const bytes = new TextEncoder().encode('{"stable":true}');
      await writeFile(path, bytes);
      const options = Object.freeze({ maxBytes: 1024 });
      const optionsSnapshot = structuredClone(options);

      await createNodeStoryFileReader().read(path, options);

      expect(path.endsWith("stable.json")).toBe(true);
      expect(options).toEqual(optionsSnapshot);
      expect(new Uint8Array(await readFile(path))).toEqual(bytes);
    });
  });

  it("returns a typed result for an unexpected coded filesystem error", async () => {
    const fileSystem: NodeStoryFileSystem = {
      stat: () => Promise.reject(errorWithCode("EIO")),
      readFile: vi.fn(),
    };

    const result = await createNodeStoryFileReader(fileSystem).read(
      "story.json",
    );

    expect(result).toEqual({
      ok: false,
      code: "read-failed",
      sourceName: "story.json",
      message: "Story file could not be read: story.json",
    });
  });

  it("propagates an unexpected programming error unchanged", async () => {
    const failure = new TypeError("filesystem adapter defect");
    const fileSystem: NodeStoryFileSystem = {
      stat: () => Promise.reject(failure),
      readFile: vi.fn(),
    };

    await expect(
      createNodeStoryFileReader(fileSystem).read("story.json"),
    ).rejects.toBe(failure);
  });
});
