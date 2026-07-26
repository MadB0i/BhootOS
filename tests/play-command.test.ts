import { describe, expect, it, vi } from "vitest";

import type { RunStoryResult } from "../src/gameplay/types.js";
import {
  executePlayCommand,
  PLAY_EXIT_CODES,
  type PlayCommandDependencies,
} from "../src/cli/play-command.js";
import type { LoadStoryResult } from "../src/story/loader-types.js";
import type { StoryDocumentV1 } from "../src/story/types.js";

type LoadFailure = Exclude<LoadStoryResult, { readonly ok: true }>;
type LoadFailureFixture = Omit<LoadFailure, "ok" | "sourceName">;

const story: StoryDocumentV1 = {
  schemaVersion: 1,
  id: "play-test",
  title: "Play Test",
  entryNodeId: "end",
  nodes: [
    {
      id: "end",
      text: "The end.",
      ending: { id: "done", title: "Done" },
    },
  ],
};

function dependencies(
  loadResult: LoadStoryResult,
  gameplayResult?: RunStoryResult,
) {
  const stderr: string[] = [];
  const runGameplay = vi.fn(async () => {
    if (gameplayResult === undefined) {
      throw new Error("gameplay should not run");
    }
    return gameplayResult;
  });

  return {
    stderr,
    runGameplay,
    value: {
      loadStoryFile: async () => loadResult,
      runGameplay,
      writeError: (text: string) => stderr.push(text),
    },
  };
}

const loaded: LoadStoryResult = {
  ok: true,
  sourceName: "story.json",
  byteLength: 1,
  story,
  diagnostics: [],
};

describe("executePlayCommand", () => {
  it("prints validation diagnostics in order and does not start gameplay", async () => {
    const capture = dependencies({
      ok: false,
      stage: "validation",
      code: "invalid-story",
      sourceName: "./broken.json",
      message: "Story document failed validation.",
      diagnostics: [
        {
          path: "$.nodes[0].id",
          code: "duplicate-node-id",
          severity: "error",
          message: "Node IDs must be unique.",
        },
        {
          path: "$.entryNodeId",
          code: "missing-entry-node",
          severity: "error",
          message: "Entry node does not exist.",
        },
      ],
    });

    const exitCode = await executePlayCommand(
      "./broken.json",
      capture.value,
    );

    expect(exitCode).toBe(PLAY_EXIT_CODES.loadFailure);
    expect(capture.runGameplay).not.toHaveBeenCalled();
    expect(capture.stderr.join("")).toBe(
      "bhootos: Story document failed validation: ./broken.json\n" +
        "  $.nodes[0].id [duplicate-node-id] Node IDs must be unique.\n" +
        "  $.entryNodeId [missing-entry-node] Entry node does not exist.\n",
    );
  });

  it("preserves the Node reader's source-aware read error", async () => {
    const capture = dependencies({
      ok: false,
      stage: "read",
      code: "read-failed",
      readCode: "file-not-found",
      sourceName: "missing.json",
      message: "Story file was not found: missing.json",
    });

    expect(await executePlayCommand("missing.json", capture.value)).toBe(2);
    expect(capture.stderr).toEqual([
      "bhootos: Story file was not found: missing.json\n",
    ]);
  });

  it("adds source context to a generic read error", async () => {
    const capture = dependencies({
      ok: false,
      stage: "read",
      code: "read-failed",
      readCode: "invalid-utf8",
      sourceName: "haunted.json",
      message: "Story file is not valid UTF-8.",
    });

    expect(await executePlayCommand("haunted.json", capture.value)).toBe(2);
    expect(capture.stderr).toEqual([
      "bhootos: Story file is not valid UTF-8: haunted.json\n",
    ]);
  });

  it("distinguishes a missing bundled installation from a custom path error", async () => {
    const capture = dependencies({
      ok: false,
      stage: "read",
      code: "read-failed",
      readCode: "file-not-found",
      sourceName: "package/episodes/kaun-hai/story.json",
      message:
        "Story file was not found: package/episodes/kaun-hai/story.json",
    });

    expect(
      await executePlayCommand(
        "package/episodes/kaun-hai/story.json",
        capture.value,
        { bundledEpisode: true },
      ),
    ).toBe(2);
    expect(capture.stderr.join("")).toContain(
      "Bundled episode installation could not be read",
    );
  });

  it("maps loading cancellation without printing an error", async () => {
    const capture = dependencies({
      ok: false,
      stage: "read",
      code: "cancelled",
      readCode: "read-cancelled",
      sourceName: "story.json",
      message: "Story loading was cancelled.",
    });

    expect(await executePlayCommand("story.json", capture.value)).toBe(130);
    expect(capture.stderr).toEqual([]);
  });

  it.each([
    {
      stage: "read",
      code: "read-failed",
      readCode: "not-a-file",
      message: "Story source is not a file: story.json",
    },
    {
      stage: "read",
      code: "read-failed",
      readCode: "permission-denied",
      message: "Permission was denied reading story file: story.json",
    },
    {
      stage: "read",
      code: "read-failed",
      readCode: "file-too-large",
      message: "Story source exceeds the 1048576-byte limit.",
    },
    {
      stage: "parse",
      code: "invalid-json",
      message: "Story JSON is invalid.",
      diagnostics: [
        {
          path: "$",
          code: "invalid-json",
          severity: "error",
          message: "Expected a JSON value.",
        },
      ],
    },
  ] satisfies readonly LoadFailureFixture[])(
    "maps $readCode$code loading failures to exit 2",
    async (failure) => {
      const capture = dependencies({
        ok: false,
        sourceName: "story.json",
        ...failure,
      });

      expect(await executePlayCommand("story.json", capture.value)).toBe(2);
      expect(capture.runGameplay).not.toHaveBeenCalled();
      expect(capture.stderr.join("")).toContain("story.json");
    },
  );

  it.each([
    ["ended", PLAY_EXIT_CODES.ended],
    ["cancelled", PLAY_EXIT_CODES.cancelled],
    ["eof", PLAY_EXIT_CODES.endOfInput],
  ] as const)("maps %s gameplay outcomes", async (status, exitCode) => {
    const capture = dependencies(
      loaded,
      { status } as RunStoryResult,
    );

    expect(await executePlayCommand("story.json", capture.value)).toBe(exitCode);
    expect(capture.stderr).toEqual([]);
  });

  it("maps invalid-attempt exhaustion and prints one final error", async () => {
    const capture = dependencies(
      loaded,
      { status: "invalid-attempt-limit" } as RunStoryResult,
    );

    expect(await executePlayCommand("story.json", capture.value)).toBe(3);
    expect(capture.stderr).toEqual([
      "bhootos: Invalid choice attempt limit exhausted\n",
    ]);
  });

  it("maps a typed gameplay failure and preserves its detail", async () => {
    const capture = dependencies(loaded, {
      status: "failed",
      code: "view-failed",
      message: "Story view failed: missing node ghost.",
    });

    expect(await executePlayCommand("story.json", capture.value)).toBe(5);
    expect(capture.stderr).toEqual([
      "bhootos: Story view failed: missing node ghost\n",
    ]);
  });

  it("does not duplicate a transition failure already rendered by gameplay", async () => {
    const capture = dependencies(loaded, {
      status: "failed",
      code: "transition-failed",
      message: "Story transition failed: invalid choice.",
    });

    expect(await executePlayCommand("story.json", capture.value)).toBe(5);
    expect(capture.stderr).toEqual([]);
  });

  it("forwards one AbortSignal through loading and gameplay", async () => {
    const controller = new AbortController();
    const loadStoryFile = vi.fn(async () => loaded);
    const runGameplay = vi.fn(
      async () => ({ status: "ended" }) as RunStoryResult,
    );

    expect(
      await executePlayCommand(
        "story.json",
        {
          loadStoryFile,
          runGameplay,
          writeError: () => undefined,
        },
        { signal: controller.signal },
      ),
    ).toBe(0);
    expect(loadStoryFile).toHaveBeenCalledWith("story.json", {
      signal: controller.signal,
    });
    expect(runGameplay).toHaveBeenCalledWith(story, {
      signal: controller.signal,
    });
  });

  it("forwards an already-aborted signal without replacing it", async () => {
    const controller = new AbortController();
    controller.abort();
    const loadStoryFile = vi.fn(async () => ({
      ok: false,
      stage: "read",
      code: "cancelled",
      sourceName: "story.json",
      message: "Story loading was cancelled.",
    }) satisfies LoadStoryResult);

    expect(
      await executePlayCommand(
        "story.json",
        {
          loadStoryFile,
          runGameplay: async () => {
            throw new Error("unreachable");
          },
          writeError: () => undefined,
        },
        { signal: controller.signal },
      ),
    ).toBe(130);
    expect(loadStoryFile).toHaveBeenCalledWith("story.json", {
      signal: controller.signal,
    });
  });

  it("lets unexpected rejections reach the outer CLI boundary", async () => {
    const expected = new Error("unexpected");
    const value: PlayCommandDependencies = {
      loadStoryFile: async () => {
        throw expected;
      },
      runGameplay: async () => {
        throw new Error("unreachable");
      },
      writeError: () => undefined,
    };

    await expect(executePlayCommand("story.json", value)).rejects.toBe(expected);
  });
});
