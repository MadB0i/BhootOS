import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadStory,
  runStory,
  type StoryGameplayRenderer,
  type StoryView,
} from "../src/index.js";
import { createNodeStoryFileReader } from "../src/story/node-file-reader.js";

describe("story file loading to gameplay integration", () => {
  it("loads a file and reaches its ending without leaking source or target paths", async () => {
    const directory = await mkdtemp(
      join(resolve("."), ".bhootos-loading-integration-"),
    );
    try {
      const path = join(directory, "story.json");
      await writeFile(
        path,
        JSON.stringify({
          schemaVersion: 1,
          id: "loaded-gameplay",
          title: "Loaded Gameplay",
          entryNodeId: "start",
          nodes: [
            {
              id: "start",
              text: "The visible beginning.",
              choices: [
                {
                  id: "finish",
                  label: "Finish",
                  nextNodeId: "secret-target",
                },
              ],
            },
            {
              id: "secret-target",
              text: "The visible ending.",
              ending: { id: "done", title: "Done" },
            },
          ],
        }),
        "utf8",
      );

      const loaded = await loadStory(
        createNodeStoryFileReader(),
        path,
      );
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) {
        return;
      }

      const visible: string[] = [];
      const renderer: StoryGameplayRenderer = {
        render: async (view: StoryView) => {
          visible.push(view.text);
          if (view.status === "active") {
            visible.push(...view.choices.map((choice) => choice.label));
          } else {
            visible.push(view.ending.title);
          }
        },
        renderInputError: (message) => visible.push(message),
        renderTransitionError: (error) => visible.push(error.message),
      };
      const played = await runStory(loaded.story, {
        renderer,
        choiceRequester: {
          request: async () => ({
            status: "selected",
            choiceId: "finish",
            choiceNumber: 1,
          }),
        },
      });

      expect(played).toMatchObject({
        status: "ended",
        session: {
          endingId: "done",
          step: 1,
          history: [
            {
              choiceId: "finish",
              toNodeId: "secret-target",
            },
          ],
        },
      });
      expect(visible).toEqual([
        "The visible beginning.",
        "Finish",
        "The visible ending.",
        "Done",
      ]);
      expect(visible.join("\n")).not.toContain(path);
      expect(visible.join("\n")).not.toContain("secret-target");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
