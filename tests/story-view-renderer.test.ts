import { describe, expect, it, vi } from "vitest";
import {
  createStorySession,
  getStoryView,
  parseStoryDocument,
  transitionStory,
  type ActiveStoryView,
  type EndingStoryView,
  type StoryEngineFailure,
  type StoryView,
} from "../src/index.js";
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";
import { TerminalRenderer } from "../src/terminal/renderer.js";
import {
  CancellationError,
  type Scheduler,
} from "../src/terminal/scheduler.js";
import {
  StoryPresentationError,
  StoryViewRenderer,
  type StoryViewRenderOptions,
} from "../src/terminal/story-view-renderer.js";

interface RenderHarness {
  readonly presentation: StoryViewRenderer;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}

function makeCaps(
  overrides: Partial<TerminalCapabilities> = {},
): TerminalCapabilities {
  return {
    isInteractive: false,
    supportsColor: false,
    supportsUnicode: false,
    supportsTerminalControl: false,
    reducedMotion: false,
    ...overrides,
  };
}

function makeHarness(options: {
  readonly capabilities?: TerminalCapabilities;
  readonly scheduler?: Scheduler;
  readonly fast?: boolean;
} = {}): RenderHarness {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const renderer = new TerminalRenderer({
    capabilities: options.capabilities ?? makeCaps(),
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
    ...(options.fast === undefined ? {} : { fast: options.fast }),
  });

  return {
    presentation: new StoryViewRenderer(renderer),
    stdout,
    stderr,
  };
}

function activeView(
  choices: ActiveStoryView["choices"] = [
    { id: "enter", label: "Enter" },
  ],
): ActiveStoryView {
  return {
    status: "active",
    nodeId: "start",
    text: "The door is open.",
    choices,
  };
}

function endingView(): EndingStoryView {
  return {
    status: "ended",
    nodeId: "ending-safe",
    text: "You made it outside.",
    ending: {
      id: "safe-ending-id",
      title: "Safe",
    },
  };
}

function joined(chunks: readonly string[]): string {
  return chunks.join("");
}

describe("active story view presentation", () => {
  it("renders narrative, one blank line, and a numbered choice", async () => {
    const harness = makeHarness();

    await harness.presentation.render(activeView());

    expect(joined(harness.stdout)).toBe(
      "The door is open.\n\n  1. Enter\n",
    );
  });

  it("preserves choice order and labels exactly", async () => {
    const harness = makeHarness();
    const view = activeView([
      { id: "first", label: "  Wait here  " },
      { id: "second", label: "Open the door?" },
      { id: "third", label: "Walk away" },
    ]);

    await harness.presentation.render(view);

    expect(joined(harness.stdout)).toBe(
      "The door is open.\n\n" +
        "  1.   Wait here  \n" +
        "  2. Open the door?\n" +
        "  3. Walk away\n",
    );
  });

  it("does not display node IDs, choice IDs, or target metadata", async () => {
    const harness = makeHarness();
    const choiceWithTarget = {
      id: "secret-choice-id",
      label: "Enter",
      nextNodeId: "secret-target-id",
    };
    const view: ActiveStoryView = {
      ...activeView(),
      nodeId: "secret-node-id",
      choices: [choiceWithTarget],
    };

    await harness.presentation.render(view);

    const output = joined(harness.stdout);
    expect(output).not.toContain("secret-node-id");
    expect(output).not.toContain("secret-choice-id");
    expect(output).not.toContain("secret-target-id");
  });

  it("preserves narrative line breaks and Unicode content", async () => {
    const harness = makeHarness();
    const view: ActiveStoryView = {
      ...activeView(),
      text: "पहली पंक्ति\nSecond line",
    };

    await harness.presentation.render(view);

    expect(joined(harness.stdout)).toBe(
      "पहली पंक्ति\nSecond line\n\n  1. Enter\n",
    );
  });

  it("does not render choices until narrative animation completes", async () => {
    let release: (() => void) | undefined;
    const scheduler: Scheduler = {
      sleep: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const harness = makeHarness({
      capabilities: makeCaps({ isInteractive: true }),
      scheduler,
    });
    const rendering = harness.presentation.render({
      ...activeView(),
      text: "AB",
    });

    await Promise.resolve();
    expect(joined(harness.stdout)).toBe("A");

    release?.();
    await rendering;
    expect(joined(harness.stdout)).toBe("AB\n\n  1. Enter\n");
  });

  it("throws a typed error for an empty active choice array", async () => {
    const harness = makeHarness();

    await expect(
      harness.presentation.render(activeView([])),
    ).rejects.toMatchObject({
      name: "StoryPresentationError",
      code: "invalid-active-view",
    });
    expect(joined(harness.stdout)).toBe("");
  });

  it.each([
    ["empty", ""],
    ["multiline", "First\nSecond"],
  ])("throws a typed error for a %s forged choice label", async (_label, label) => {
    const harness = makeHarness();

    await expect(
      harness.presentation.render(activeView([{ id: "bad", label }])),
    ).rejects.toBeInstanceOf(StoryPresentationError);
    expect(joined(harness.stdout)).toBe("");
  });

  it("does not mutate the view, choices, options, or capabilities", async () => {
    const capabilities = makeCaps();
    const choices = [{ id: "enter", label: "Enter" }];
    const view: ActiveStoryView = {
      status: "active",
      nodeId: "start",
      text: "Text.",
      choices,
    };
    const options: StoryViewRenderOptions = { animateText: false };
    const viewSnapshot = structuredClone(view);
    const optionsSnapshot = structuredClone(options);
    const capabilitiesSnapshot = structuredClone(capabilities);
    const harness = makeHarness({ capabilities });

    await harness.presentation.render(view, options);

    expect(view).toEqual(viewSnapshot);
    expect(choices).toEqual(viewSnapshot.choices);
    expect(options).toEqual(optionsSnapshot);
    expect(capabilities).toEqual(capabilitiesSnapshot);
  });
});

describe("ending story view presentation", () => {
  it("renders narrative, marker, and title with restrained spacing", async () => {
    const harness = makeHarness();

    await harness.presentation.render(endingView());

    expect(joined(harness.stdout)).toBe(
      "You made it outside.\n\nENDING\nSafe\n",
    );
  });

  it("does not display ending ID, node ID, or choices", async () => {
    const harness = makeHarness();

    await harness.presentation.render(endingView());

    const output = joined(harness.stdout);
    expect(output).not.toContain("safe-ending-id");
    expect(output).not.toContain("ending-safe");
    expect(output).not.toMatch(/\d+\.\s/u);
  });

  it.each([
    ["missing ending", { ...endingView(), ending: undefined }],
    [
      "empty ending title",
      { ...endingView(), ending: { id: "safe", title: "" } },
    ],
  ])("throws a typed error for %s metadata", async (_label, forgedView) => {
    const harness = makeHarness();

    await expect(
      harness.presentation.render(forgedView as unknown as StoryView),
    ).rejects.toMatchObject({
      name: "StoryPresentationError",
      code: "invalid-ending-view",
    });
    expect(joined(harness.stdout)).toBe("");
  });

  it("throws a typed error for an unsupported forged status", async () => {
    const harness = makeHarness();
    const forged = { ...activeView(), status: "paused" };

    await expect(
      harness.presentation.render(forged as unknown as StoryView),
    ).rejects.toMatchObject({
      code: "invalid-story-view",
    });
  });

  it("does not mutate ending metadata", async () => {
    const view = endingView();
    const snapshot = structuredClone(view);
    const harness = makeHarness();

    await harness.presentation.render(view);

    expect(view).toEqual(snapshot);
  });
});

describe("story presentation capabilities and animation", () => {
  it("requests animation delays in interactive normal mode", async () => {
    const scheduler = {
      sleep: vi.fn().mockResolvedValue(undefined),
    };
    const harness = makeHarness({
      capabilities: makeCaps({ isInteractive: true }),
      scheduler,
    });

    await harness.presentation.render(activeView());

    expect(scheduler.sleep).toHaveBeenCalled();
  });

  it.each([
    ["noninteractive", makeCaps({ isInteractive: false }), false],
    [
      "reduced motion",
      makeCaps({ isInteractive: true, reducedMotion: true }),
      false,
    ],
    ["fast", makeCaps({ isInteractive: true }), true],
  ])(
    "%s mode requests no animation delays",
    async (_label, capabilities, fast) => {
      const scheduler = {
        sleep: vi.fn().mockResolvedValue(undefined),
      };
      const harness = makeHarness({ capabilities, scheduler, fast });

      await harness.presentation.render(activeView());

      expect(scheduler.sleep).not.toHaveBeenCalled();
    },
  );

  it("explicitly disabled animation requests no delays", async () => {
    const scheduler = {
      sleep: vi.fn().mockResolvedValue(undefined),
    };
    const harness = makeHarness({
      capabilities: makeCaps({ isInteractive: true }),
      scheduler,
    });

    await harness.presentation.render(activeView(), { animateText: false });

    expect(scheduler.sleep).not.toHaveBeenCalled();
  });

  it("no-color ending output contains no ANSI", async () => {
    const harness = makeHarness({
      capabilities: makeCaps({ supportsColor: false }),
    });

    await harness.presentation.render(endingView());

    expect(joined(harness.stdout)).not.toContain("\u001b[");
  });

  it("injected color support is deterministic", async () => {
    const first = makeHarness({
      capabilities: makeCaps({ supportsColor: true }),
    });
    const second = makeHarness({
      capabilities: makeCaps({ supportsColor: true }),
    });

    await first.presentation.render(endingView());
    await second.presentation.render(endingView());

    expect(joined(first.stdout)).toBe(joined(second.stdout));
    expect(joined(first.stdout)).toContain("\u001b[");
  });

  it("ASCII mode introduces no Unicode decorations", async () => {
    const harness = makeHarness({
      capabilities: makeCaps({ supportsUnicode: false }),
    });

    await harness.presentation.render(endingView());

    expect(
      [...joined(harness.stdout)].every(
        (character) => (character.codePointAt(0) ?? 0) <= 0x7f,
      ),
    ).toBe(true);
  });
});

describe("story presentation cancellation", () => {
  it.each([
    ["active", activeView()],
    ["ending", endingView()],
  ])("pre-aborted %s view writes nothing", async (_label, view) => {
    const controller = new AbortController();
    controller.abort();
    const harness = makeHarness();

    await expect(
      harness.presentation.render(view, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(CancellationError);
    expect(joined(harness.stdout)).toBe("");
    expect(joined(harness.stderr)).toBe("");
  });

  it("mid-narrative cancellation prevents choices and trailing whitespace", async () => {
    const controller = new AbortController();
    const scheduler: Scheduler = {
      sleep: vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new CancellationError());
      }),
    };
    const harness = makeHarness({
      capabilities: makeCaps({ isInteractive: true }),
      scheduler,
    });

    await expect(
      harness.presentation.render(activeView(), {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(CancellationError);

    expect(joined(harness.stdout)).toBe("T");
    expect(joined(harness.stdout)).not.toContain("Enter");
    expect(joined(harness.stdout)).not.toContain("\n");
  });

  it("mid-narrative cancellation prevents ending marker and title", async () => {
    const controller = new AbortController();
    const scheduler: Scheduler = {
      sleep: vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new CancellationError());
      }),
    };
    const harness = makeHarness({
      capabilities: makeCaps({ isInteractive: true }),
      scheduler,
    });

    await expect(
      harness.presentation.render(endingView(), {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(CancellationError);

    expect(joined(harness.stdout)).toBe("Y");
    expect(joined(harness.stdout)).not.toContain("ENDING");
    expect(joined(harness.stdout)).not.toContain("Safe");
    expect(joined(harness.stdout)).not.toContain("\n");
  });

  it("propagates unrelated scheduler failures", async () => {
    const scheduler = {
      sleep: vi.fn().mockRejectedValue(new Error("scheduler failed")),
    };
    const harness = makeHarness({
      capabilities: makeCaps({ isInteractive: true }),
      scheduler,
    });

    await expect(
      harness.presentation.render(activeView()),
    ).rejects.toThrow("scheduler failed");
  });
});

describe("transition-error presentation", () => {
  it("writes the engine message exactly once to stderr with one newline", () => {
    const harness = makeHarness();
    const failure: StoryEngineFailure = {
      ok: false,
      code: "choice-not-found",
      message: 'Choice "open" is not available.',
    };

    harness.presentation.renderTransitionError(failure);

    expect(joined(harness.stdout)).toBe("");
    expect(joined(harness.stderr)).toBe(
      'Choice "open" is not available.\n',
    );
  });

  it("contains no ANSI when color is disabled", () => {
    const harness = makeHarness({
      capabilities: makeCaps({ supportsColor: false }),
    });
    const failure: StoryEngineFailure = {
      ok: false,
      code: "session-ended",
      message: "The story has already ended.",
    };

    harness.presentation.renderTransitionError(failure);

    expect(joined(harness.stderr)).not.toContain("\u001b[");
  });

  it("does not mutate the engine failure", () => {
    const harness = makeHarness();
    const failure: StoryEngineFailure = {
      ok: false,
      code: "story-mismatch",
      message: "The session belongs to another story.",
    };
    const snapshot = structuredClone(failure);

    harness.presentation.renderTransitionError(failure);

    expect(failure).toEqual(snapshot);
  });
});

describe("input-error presentation", () => {
  it("writes the supplied message exactly once to stderr", () => {
    const harness = makeHarness();

    harness.presentation.renderInputError(
      '"abc" is not a valid choice number.',
    );

    expect(joined(harness.stdout)).toBe("");
    expect(joined(harness.stderr)).toBe(
      '"abc" is not a valid choice number.\n',
    );
  });
});

describe("story engine presentation integration", () => {
  it("renders an engine active view and its ending without leaking a target", async () => {
    const parsed = parseStoryDocument({
      schemaVersion: 1,
      id: "presentation-story",
      title: "Presentation Story",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "The door is open.",
          choices: [
            {
              id: "enter",
              label: "Enter",
              nextNodeId: "ending-safe",
            },
          ],
        },
        {
          id: "ending-safe",
          text: "You made it outside.",
          ending: { id: "safe", title: "Safe" },
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const created = createStorySession(parsed.story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const harness = makeHarness();
    const active = getStoryView(parsed.story, created.session);
    expect(active.ok).toBe(true);
    if (!active.ok) {
      return;
    }
    await harness.presentation.render(active.view);

    const transitioned = transitionStory(parsed.story, created.session, {
      type: "select-choice",
      choiceId: "enter",
    });
    expect(transitioned.ok).toBe(true);
    if (!transitioned.ok) {
      return;
    }
    const ending = getStoryView(parsed.story, transitioned.session);
    expect(ending.ok).toBe(true);
    if (!ending.ok) {
      return;
    }
    await harness.presentation.render(ending.view);

    const output = joined(harness.stdout);
    expect(output).toContain("The door is open.");
    expect(output).toContain("  1. Enter");
    expect(output).toContain("You made it outside.");
    expect(output).toContain("ENDING");
    expect(output).toContain("Safe");
    expect(output).not.toContain("ending-safe");
  });
});
