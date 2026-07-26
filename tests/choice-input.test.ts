import { describe, expect, it, vi } from "vitest";
import {
  createStorySession,
  getStoryView,
  requestStoryChoice,
  selectChoiceFromLine,
  transitionStory,
  type ActiveStoryView,
  type LineInput,
  type ReadLineOptions,
  type ReadLineResult,
  type RequestStoryChoiceOptions,
  type StoryDocumentV1,
} from "../src/index.js";
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";
import { TerminalRenderer } from "../src/terminal/renderer.js";
import { StoryViewRenderer } from "../src/terminal/story-view-renderer.js";

const activeView: ActiveStoryView = {
  status: "active",
  nodeId: "hall",
  text: "Three doors wait.",
  choices: [
    { id: "left", label: "Take the left door" },
    { id: "middle", label: "Take the middle door" },
    { id: "right", label: "Take the right door" },
  ],
};

class FakeLineInput implements LineInput {
  readonly calls: ReadLineOptions[] = [];

  constructor(
    private readonly result: ReadLineResult | Error,
  ) {}

  readLine(options: ReadLineOptions = {}): Promise<ReadLineResult> {
    this.calls.push(options);
    return this.result instanceof Error
      ? Promise.reject(this.result)
      : Promise.resolve(this.result);
  }
}

describe("selectChoiceFromLine", () => {
  it("selects the first choice with 1", () => {
    expect(selectChoiceFromLine(activeView, "1")).toEqual({
      ok: true,
      choiceId: "left",
      choiceNumber: 1,
    });
  });

  it("selects the last choice", () => {
    expect(selectChoiceFromLine(activeView, "3")).toEqual({
      ok: true,
      choiceId: "right",
      choiceNumber: 3,
    });
  });

  it("uses original choice order for numbering", () => {
    const reordered: ActiveStoryView = {
      ...activeView,
      choices: [
        activeView.choices[2]!,
        activeView.choices[0]!,
        activeView.choices[1]!,
      ],
    };

    expect(selectChoiceFromLine(reordered, "2")).toMatchObject({
      ok: true,
      choiceId: "left",
      choiceNumber: 2,
    });
  });

  it.each(["  2", "2  ", "  3  ", "\t1\t"])(
    "accepts leading and trailing whitespace in %j",
    (line) => {
      expect(selectChoiceFromLine(activeView, line).ok).toBe(true);
    },
  );

  it("rejects empty input with a stable message", () => {
    expect(selectChoiceFromLine(activeView, "")).toEqual({
      ok: false,
      code: "empty-input",
      message: "Enter a choice number.",
    });
  });

  it("rejects whitespace-only input", () => {
    expect(selectChoiceFromLine(activeView, " \t ")).toMatchObject({
      ok: false,
      code: "empty-input",
    });
  });

  it("rejects zero as out of range", () => {
    expect(selectChoiceFromLine(activeView, "0")).toEqual({
      ok: false,
      code: "choice-out-of-range",
      message: "Choice 0 is unavailable. Enter a number from 1 to 3.",
    });
  });

  it.each([
    ["negative number", "-1"],
    ["decimal", "1.5"],
    ["leading zero", "01"],
    ["plus sign", "+1"],
    ["exponent notation", "1e2"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["non-number text", "abc"],
    ["number followed by extra text", "1 extra"],
  ])("rejects %s syntax", (_label, line) => {
    expect(selectChoiceFromLine(activeView, line)).toEqual({
      ok: false,
      code: "invalid-number",
      message: `${JSON.stringify(line)} is not a valid choice number.`,
    });
  });

  it("rejects a number above range", () => {
    expect(selectChoiceFromLine(activeView, "4")).toEqual({
      ok: false,
      code: "choice-out-of-range",
      message: "Choice 4 is unavailable. Enter a number from 1 to 3.",
    });
  });

  it("rejects an unsafe integer", () => {
    expect(
      selectChoiceFromLine(activeView, "9007199254740992"),
    ).toMatchObject({
      ok: false,
      code: "invalid-number",
    });
  });

  it("returns the exact selected choice ID without target metadata", () => {
    const result = selectChoiceFromLine(activeView, "2");

    expect(result).toEqual({
      ok: true,
      choiceId: "middle",
      choiceNumber: 2,
    });
    expect("nextNodeId" in result).toBe(false);
  });

  it("does not mutate the view, choice array, or input", () => {
    const mutableView: ActiveStoryView = structuredClone(activeView);
    const snapshot = structuredClone(mutableView);
    const line = "  2  ";

    selectChoiceFromLine(mutableView, line);

    expect(mutableView).toEqual(snapshot);
    expect(line).toBe("  2  ");
  });

  it.each([
    [
      "non-active status",
      { ...activeView, status: "ended" },
    ],
    [
      "missing choices",
      { ...activeView, choices: undefined },
    ],
    [
      "empty choice array",
      { ...activeView, choices: [] },
    ],
    [
      "empty choice ID",
      { ...activeView, choices: [{ id: "", label: "Wait" }] },
    ],
    [
      "non-string choice ID",
      { ...activeView, choices: [{ id: 1, label: "Wait" }] },
    ],
    [
      "invalid choice label",
      { ...activeView, choices: [{ id: "wait", label: 1 }] },
    ],
    [
      "empty choice label",
      { ...activeView, choices: [{ id: "wait", label: "" }] },
    ],
    [
      "multiline choice label",
      { ...activeView, choices: [{ id: "wait", label: "Wait\nnow" }] },
    ],
    [
      "duplicate choice IDs",
      {
        ...activeView,
        choices: [
          { id: "same", label: "First" },
          { id: "same", label: "Second" },
        ],
      },
    ],
  ])("rejects a forged view with %s", (_label, forgedView) => {
    expect(
      selectChoiceFromLine(
        forgedView as unknown as ActiveStoryView,
        "1",
      ),
    ).toEqual({
      ok: false,
      code: "invalid-active-view",
      message:
        "Active story view must contain valid, uniquely identified choices.",
    });
  });
});

describe("requestStoryChoice", () => {
  it("returns a selected result", async () => {
    const input = new FakeLineInput({ status: "line", value: "2" });

    await expect(requestStoryChoice(input, activeView)).resolves.toEqual({
      status: "selected",
      choiceId: "middle",
      choiceNumber: 2,
    });
  });

  it("returns an invalid result without retrying", async () => {
    const input = new FakeLineInput({ status: "line", value: "abc" });

    await expect(requestStoryChoice(input, activeView)).resolves.toEqual({
      status: "invalid",
      code: "invalid-number",
      message: '"abc" is not a valid choice number.',
    });
    expect(input.calls).toHaveLength(1);
  });

  it("reads exactly one line and passes the default prompt", async () => {
    const input = new FakeLineInput({ status: "line", value: "1" });

    await requestStoryChoice(input, activeView);

    expect(input.calls).toEqual([{ prompt: "> " }]);
  });

  it("passes a custom prompt unchanged", async () => {
    const input = new FakeLineInput({ status: "line", value: "1" });

    await requestStoryChoice(input, activeView, {
      prompt: "Choose exactly once: ",
    });

    expect(input.calls).toEqual([{ prompt: "Choose exactly once: " }]);
  });

  it("passes the cancellation signal through", async () => {
    const controller = new AbortController();
    const input = new FakeLineInput({ status: "line", value: "1" });

    await requestStoryChoice(input, activeView, {
      signal: controller.signal,
    });

    expect(input.calls).toEqual([
      { prompt: "> ", signal: controller.signal },
    ]);
  });

  it("does not read or prompt when the signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = new FakeLineInput({ status: "line", value: "1" });

    await expect(
      requestStoryChoice(input, activeView, {
        prompt: "Never written",
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: "cancelled" });
    expect(input.calls).toEqual([]);
  });

  it.each([
    ["EOF", { status: "eof" } as const],
    ["cancellation", { status: "cancelled" } as const],
  ])("preserves %s as a distinct result", async (_label, readResult) => {
    const input = new FakeLineInput(readResult);

    await expect(requestStoryChoice(input, activeView)).resolves.toEqual(
      readResult,
    );
  });

  it("propagates an unexpected adapter failure", async () => {
    const input = new FakeLineInput(new Error("input failed"));

    await expect(requestStoryChoice(input, activeView)).rejects.toThrow(
      "input failed",
    );
  });

  it("does not mutate the input, view, or options", async () => {
    const input = new FakeLineInput({ status: "line", value: "1" });
    const view = structuredClone(activeView);
    const options: RequestStoryChoiceOptions = { prompt: "Pick: " };
    const viewSnapshot = structuredClone(view);
    const optionsSnapshot = structuredClone(options);

    await requestStoryChoice(input, view, options);

    expect(input.calls).toEqual([{ prompt: "Pick: " }]);
    expect(view).toEqual(viewSnapshot);
    expect(options).toEqual(optionsSnapshot);
  });
});

describe("choice input integration", () => {
  it("maps a rendered number to an engine choice without exposing its target", async () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "choice-input-integration",
      title: "Choice Input Integration",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "Choose a door.",
          choices: [
            {
              id: "wait",
              label: "Wait",
              nextNodeId: "still-waiting",
            },
            {
              id: "leave",
              label: "Leave",
              nextNodeId: "escaped",
            },
          ],
        },
        {
          id: "still-waiting",
          text: "You wait.",
          ending: { id: "waiting", title: "Still Here" },
        },
        {
          id: "escaped",
          text: "You escape.",
          ending: { id: "safe", title: "Safe" },
        },
      ],
    };
    const created = createStorySession(story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const viewed = getStoryView(story, created.session);
    expect(viewed.ok).toBe(true);
    if (!viewed.ok || viewed.view.status !== "active") {
      return;
    }

    const output: string[] = [];
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
        stdout: (text) => output.push(text),
        stderr: vi.fn(),
      }),
    );
    await presentation.render(viewed.view);
    expect(output.join("")).toContain("  2. Leave");

    const input = new FakeLineInput({ status: "line", value: "2" });
    const requested = await requestStoryChoice(input, viewed.view);
    expect(requested).toEqual({
      status: "selected",
      choiceId: "leave",
      choiceNumber: 2,
    });
    expect("nextNodeId" in requested).toBe(false);
    if (requested.status !== "selected") {
      return;
    }

    const transitioned = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: requested.choiceId,
    });
    expect(transitioned.ok).toBe(true);
    if (transitioned.ok) {
      expect(transitioned.view).toMatchObject({
        status: "ended",
        nodeId: "escaped",
        ending: { id: "safe" },
      });
    }
  });
});
