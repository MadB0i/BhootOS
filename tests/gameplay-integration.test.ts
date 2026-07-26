import { describe, expect, it } from "vitest";
import {
  runStory,
  type LineInput,
  type ReadLineOptions,
  type ReadLineResult,
  type StoryDocumentV1,
} from "../src/index.js";
import { createStoryGameplayDependencies } from "../src/gameplay/adapters.js";
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";
import { TerminalRenderer } from "../src/terminal/renderer.js";
import { StoryViewRenderer } from "../src/terminal/story-view-renderer.js";

class ScriptedLineInput implements LineInput {
  readonly options: ReadLineOptions[] = [];
  private index = 0;

  constructor(private readonly lines: readonly string[]) {}

  readLine(options: ReadLineOptions = {}): Promise<ReadLineResult> {
    this.options.push(options);
    const line = this.lines[this.index];
    this.index += 1;
    return Promise.resolve(
      line === undefined
        ? { status: "eof" }
        : { status: "line", value: line },
    );
  }
}

describe("concrete in-memory gameplay integration", () => {
  it("composes presentation, numbered input, and engine traversal", async () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "gameplay-integration",
      title: "Gameplay Integration",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "Two doors wait.",
          choices: [
            {
              id: "stay",
              label: "Stay",
              nextNodeId: "hidden-stay-target",
            },
            {
              id: "leave",
              label: "Leave",
              nextNodeId: "hidden-safe-target",
            },
          ],
        },
        {
          id: "hidden-stay-target",
          text: "You remain.",
          ending: { id: "stayed", title: "Still Here" },
        },
        {
          id: "hidden-safe-target",
          text: "You escape.",
          ending: { id: "safe", title: "Safe" },
        },
      ],
    };
    const stdout: string[] = [];
    const stderr: string[] = [];
    const capabilities: TerminalCapabilities = {
      isInteractive: false,
      supportsColor: false,
      supportsUnicode: false,
      supportsTerminalControl: false,
      reducedMotion: false,
    };
    const presentation = new StoryViewRenderer(
      new TerminalRenderer({
        capabilities,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      }),
    );
    const input = new ScriptedLineInput(["abc", "2"]);

    const result = await runStory(
      story,
      createStoryGameplayDependencies(presentation, input),
      {
        animateText: false,
        choicePrompt: "Choose: ",
      },
    );

    expect(result).toMatchObject({
      status: "ended",
      session: {
        endingId: "safe",
        step: 1,
        history: [
          {
            step: 1,
            fromNodeId: "start",
            choiceId: "leave",
            toNodeId: "hidden-safe-target",
          },
        ],
      },
      view: {
        status: "ended",
        ending: { id: "safe", title: "Safe" },
      },
    });
    expect(input.options).toEqual([
      { prompt: "Choose: " },
      { prompt: "Choose: " },
    ]);

    const visibleOutput = stdout.join("") + stderr.join("");
    expect(stdout.join("")).toBe(
      "Two doors wait.\n\n" +
        "  1. Stay\n" +
        "  2. Leave\n" +
        "You escape.\n\n" +
        "ENDING\n" +
        "Safe\n",
    );
    expect(stderr.join("")).toBe(
      '"abc" is not a valid choice number.\n',
    );
    expect(visibleOutput).not.toContain("hidden-stay-target");
    expect(visibleOutput).not.toContain("hidden-safe-target");
  });
});
