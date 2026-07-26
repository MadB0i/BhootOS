import { describe, expect, it } from "vitest";

import {
  createStorySession,
  transitionStory,
  type StoryDocumentV2,
} from "../src/index.js";
import {
  createBundledSaveStore,
  createEmptyBundledSave,
} from "../src/save/save-store.js";
import type { SaveFileSystem } from "../src/save/types.js";

const story: StoryDocumentV2 = {
  schemaVersion: 2,
  id: "save-test",
  title: "Save Test",
  entryNodeId: "start",
  initialState: {
    flags: { seen: false },
    inventory: [],
  },
  nodes: [
    {
      id: "start",
      text: "Start.",
      choices: [
        {
          id: "finish",
          label: "Finish",
          nextNodeId: "end",
          effects: [{ type: "set-flag", flag: "seen", value: true }],
        },
        {
          id: "inspect",
          label: "Inspect",
          nextNodeId: "start",
          effects: [{ type: "set-flag", flag: "seen", value: true }],
        },
      ],
    },
    {
      id: "end",
      text: "End.",
      ending: { id: "done", title: "Done" },
    },
  ],
};

class MemorySaveFileSystem implements SaveFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly operations: string[] = [];
  readCalls = 0;

  async stat(path: string): Promise<{ readonly size: number; isFile(): boolean }> {
    const value = this.files.get(path);
    if (value === undefined) {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }
    this.operations.push(`stat:${path}`);
    return { size: value.byteLength, isFile: () => true };
  }

  async readFile(path: string): Promise<Uint8Array> {
    this.readCalls += 1;
    const value = this.files.get(path);
    if (value === undefined) {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }
    return value;
  }

  async mkdir(path: string): Promise<void> {
    this.operations.push(`mkdir:${path}`);
  }

  async writeFile(
    path: string,
    data: string,
    options: { readonly flag: "wx"; readonly mode: number },
  ): Promise<void> {
    expect(options).toMatchObject({ flag: "wx", mode: 0o600 });
    if (this.files.has(path)) {
      throw Object.assign(new Error("exists"), { code: "EEXIST" });
    }
    this.operations.push(`write:${path}`);
    this.files.set(path, new TextEncoder().encode(data));
  }

  async rename(from: string, to: string): Promise<void> {
    const value = this.files.get(from);
    if (value === undefined) {
      throw new Error("missing temporary file");
    }
    this.operations.push(`rename:${from}:${to}`);
    this.files.set(to, value);
    this.files.delete(from);
  }

  async unlink(path: string): Promise<void> {
    this.operations.push(`unlink:${path}`);
    this.files.delete(path);
  }
}

function setup(maxBytes?: number) {
  const fileSystem = new MemorySaveFileSystem();
  const store = createBundledSaveStore({
    fileSystem,
    savePath: "/data/state.json",
    saveDirectory: "/data",
    createTemporaryPath: () => "/data/state-test.tmp",
    story,
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
  return { fileSystem, store };
}

describe("bundled save store", () => {
  it("returns a versioned empty save when no file exists", async () => {
    const { store } = setup();
    await expect(store.load()).resolves.toEqual({
      ok: true,
      exists: false,
      save: createEmptyBundledSave(story),
    });
  });

  it("writes an active session through an exclusive temporary file and rename", async () => {
    const { fileSystem, store } = setup();
    const created = createStorySession(story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const save = {
      ...createEmptyBundledSave(story),
      activeSession: created.session,
    };
    await expect(store.write(save)).resolves.toEqual({ ok: true });
    expect(fileSystem.operations).toEqual([
      "mkdir:/data",
      "write:/data/state-test.tmp",
      "rename:/data/state-test.tmp:/data/state.json",
    ]);
    await expect(store.load()).resolves.toMatchObject({
      ok: true,
      exists: true,
      save: { activeSession: created.session },
    });
    expect(fileSystem.operations.at(-1)).toBe("stat:/data/state.json");
  });

  it("does not delete a pre-existing temporary-file collision", async () => {
    const { fileSystem, store } = setup();
    const existing = new TextEncoder().encode("unrelated");
    fileSystem.files.set("/data/state-test.tmp", existing);

    await expect(
      store.write(createEmptyBundledSave(story)),
    ).resolves.toMatchObject({
      ok: false,
      code: "save-write-failed",
    });

    expect(fileSystem.files.get("/data/state-test.tmp")).toBe(existing);
    expect(fileSystem.operations).not.toContain("unlink:/data/state-test.tmp");
  });

  it("rejects corrupt JSON and oversized saves without discarding them", async () => {
    const corrupt = setup();
    corrupt.fileSystem.files.set(
      "/data/state.json",
      new TextEncoder().encode("{no"),
    );
    await expect(corrupt.store.load()).resolves.toMatchObject({
      ok: false,
      code: "save-corrupt",
    });
    expect(corrupt.fileSystem.files.has("/data/state.json")).toBe(true);

    const oversized = setup(4);
    oversized.fileSystem.files.set(
      "/data/state.json",
      new TextEncoder().encode("12345"),
    );
    await expect(oversized.store.load()).resolves.toMatchObject({
      ok: false,
      code: "save-too-large",
    });
    expect(oversized.fileSystem.readCalls).toBe(0);
  });

  it("rejects story mismatches, unknown endings, and forged active sessions", async () => {
    const { fileSystem, store } = setup();
    for (const invalid of [
      {
        ...createEmptyBundledSave(story),
        storyId: "other",
      },
      {
        ...createEmptyBundledSave(story),
        discoveredEndingIds: ["not-an-ending"],
      },
      {
        ...createEmptyBundledSave(story),
        activeSession: {
          storyId: story.id,
          currentNodeId: "missing",
          status: "active",
          step: 0,
          history: [],
        },
      },
    ]) {
      fileSystem.files.set(
        "/data/state.json",
        new TextEncoder().encode(JSON.stringify(invalid)),
      );
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        code: "save-corrupt",
      });
    }
  });

  it("rejects unsupported fields throughout active-session history", async () => {
    const { fileSystem, store } = setup();
    const created = createStorySession(story);
    if (!created.ok) {
      throw new Error("fixture session failed");
    }
    const advanced = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: "inspect",
    });
    if (!advanced.ok) {
      throw new Error("fixture transition failed");
    }

    const invalidSessions = [
      {
        ...structuredClone(advanced.session),
        unexpected: true,
      },
      {
        ...structuredClone(advanced.session),
        history: advanced.session.history.map((entry) => ({
          ...structuredClone(entry),
          unexpected: true,
        })),
      },
      {
        ...structuredClone(advanced.session),
        history: advanced.session.history.map((entry) => ({
          ...structuredClone(entry),
          effects: entry.effects?.map((effect) => ({
            ...structuredClone(effect),
            unexpected: true,
          })),
        })),
      },
    ];

    for (const activeSession of invalidSessions) {
      fileSystem.files.set(
        "/data/state.json",
        new TextEncoder().encode(
          JSON.stringify({
            ...createEmptyBundledSave(story),
            activeSession,
          }),
        ),
      );
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        code: "save-corrupt",
      });
    }
  });

  it("returns a deeply frozen canonical active session", async () => {
    const { store } = setup();
    const created = createStorySession(story);
    if (!created.ok) {
      throw new Error("fixture session failed");
    }
    const advanced = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: "inspect",
    });
    if (!advanced.ok) {
      throw new Error("fixture transition failed");
    }

    await expect(
      store.write({
        ...createEmptyBundledSave(story),
        activeSession: advanced.session,
      }),
    ).resolves.toEqual({ ok: true });
    const loaded = await store.load();
    if (!loaded.ok || loaded.save.activeSession === undefined) {
      throw new Error("saved active session did not load");
    }
    const active = loaded.save.activeSession;
    const entry = active.history[0];
    if (entry === undefined) {
      throw new Error("saved history entry is missing");
    }

    expect(Object.isFrozen(active)).toBe(true);
    expect(Object.isFrozen(active.history)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.effects)).toBe(true);
    expect(Object.isFrozen(entry.effects?.[0])).toBe(true);
    expect(Object.isFrozen(entry.flags)).toBe(true);
    expect(Object.isFrozen(entry.inventory)).toBe(true);
    expect(Object.isFrozen(active.flags)).toBe(true);
    expect(Object.isFrozen(active.inventory)).toBe(true);
  });

  it("accepts ending discovery separately but rejects an ended active run", async () => {
    const { store } = setup();
    const created = createStorySession(story);
    if (!created.ok) {
      throw new Error("fixture session failed");
    }
    const ended = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: "finish",
    });
    if (!ended.ok) {
      throw new Error("fixture transition failed");
    }

    await expect(
      store.write({
        ...createEmptyBundledSave(story),
        discoveredEndingIds: ["done"],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      store.write({
        ...createEmptyBundledSave(story),
        activeSession: ended.session,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "save-corrupt",
    });
  });
});
