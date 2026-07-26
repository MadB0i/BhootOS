import { describe, expect, it, vi } from "vitest";
import {
  createStorySession,
  getStoryView,
  runStory,
  transitionStory,
  type ActiveStoryView,
  type RequestStoryChoiceOptions,
  type RequestStoryChoiceResult,
  type RunStoryOptions,
  type StoryChoiceRequester,
  type StoryDocumentV1,
  type StoryEngineFailure,
  type StoryGameplayDependencies,
  type StoryGameplayRenderer,
  type StoryGameplayRenderOptions,
  type StorySession,
  type StoryView,
} from "../src/index.js";
import { runStoryWithEngine } from "../src/gameplay/run-story.js";
import { CancellationError } from "../src/terminal/scheduler.js";

type RequestScript =
  | RequestStoryChoiceResult
  | Error
  | ((
      view: ActiveStoryView,
      options: RequestStoryChoiceOptions,
    ) => RequestStoryChoiceResult | Promise<RequestStoryChoiceResult>);

class FakeRenderer implements StoryGameplayRenderer {
  readonly views: StoryView[] = [];
  readonly renderOptions: StoryGameplayRenderOptions[] = [];
  readonly inputErrors: string[] = [];
  readonly transitionErrors: StoryEngineFailure[] = [];
  readonly events: string[];
  onRender:
    | ((
        view: StoryView,
        options: StoryGameplayRenderOptions,
      ) => void | Promise<void>)
    | undefined;
  onInputError: ((message: string) => void) | undefined;
  onTransitionError: ((error: StoryEngineFailure) => void) | undefined;

  constructor(events: string[] = []) {
    this.events = events;
  }

  async render(
    view: StoryView,
    options: StoryGameplayRenderOptions = {},
  ): Promise<void> {
    this.views.push(view);
    this.renderOptions.push(options);
    this.events.push(`render:${view.nodeId}`);
    await this.onRender?.(view, options);
  }

  renderTransitionError(error: StoryEngineFailure): void {
    this.transitionErrors.push(error);
    this.events.push(`transition-error:${error.code}`);
    this.onTransitionError?.(error);
  }

  renderInputError(message: string): void {
    this.inputErrors.push(message);
    this.events.push(`input-error:${message}`);
    this.onInputError?.(message);
  }
}

class ScriptedRequester implements StoryChoiceRequester {
  readonly views: ActiveStoryView[] = [];
  readonly options: RequestStoryChoiceOptions[] = [];
  readonly events: string[];
  private index = 0;

  constructor(
    private readonly scripts: readonly RequestScript[],
    events: string[] = [],
  ) {
    this.events = events;
  }

  async request(
    view: ActiveStoryView,
    options: RequestStoryChoiceOptions = {},
  ): Promise<RequestStoryChoiceResult> {
    this.views.push(view);
    this.options.push(options);
    this.events.push(`request:${view.nodeId}`);
    const script = this.scripts[this.index];
    this.index += 1;
    if (script === undefined) {
      throw new Error("Scripted requester was exhausted.");
    }
    if (script instanceof Error) {
      throw script;
    }
    return typeof script === "function"
      ? script(view, options)
      : script;
  }
}

function selected(
  choiceId: string,
  choiceNumber = 1,
): RequestStoryChoiceResult {
  return { status: "selected", choiceId, choiceNumber };
}

function invalid(
  message = '"bad" is not a valid choice number.',
): RequestStoryChoiceResult {
  return {
    status: "invalid",
    code: "invalid-number",
    message,
  };
}

function dependencies(
  scripts: readonly RequestScript[],
  events: string[] = [],
): {
  readonly value: StoryGameplayDependencies;
  readonly renderer: FakeRenderer;
  readonly requester: ScriptedRequester;
} {
  const renderer = new FakeRenderer(events);
  const requester = new ScriptedRequester(scripts, events);
  return {
    value: Object.freeze({
      renderer,
      choiceRequester: requester,
    }),
    renderer,
    requester,
  };
}

function oneStepStory(id = "one-step"): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id,
    title: "One Step",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "Choose.",
        choices: [
          {
            id: "finish",
            label: "Finish",
            nextNodeId: "ending",
          },
        ],
      },
      {
        id: "ending",
        text: "Done.",
        ending: { id: "done", title: "Done" },
      },
    ],
  };
}

function multiStepStory(): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id: "multi-step",
    title: "Multi Step",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        text: "Start.",
        choices: [
          { id: "advance", label: "Advance", nextNodeId: "middle" },
        ],
      },
      {
        id: "middle",
        text: "Middle.",
        choices: [
          { id: "finish", label: "Finish", nextNodeId: "ending" },
        ],
      },
      {
        id: "ending",
        text: "End.",
        ending: { id: "complete", title: "Complete" },
      },
    ],
  };
}

function entryEndingStory(): StoryDocumentV1 {
  return {
    schemaVersion: 1,
    id: "entry-ending",
    title: "Entry Ending",
    entryNodeId: "ending",
    nodes: [
      {
        id: "ending",
        text: "Already done.",
        ending: { id: "immediate", title: "Immediate" },
      },
    ],
  };
}

function defaultEngine() {
  return {
    createSession: createStorySession,
    getView: getStoryView,
    transition: (
      story: StoryDocumentV1,
      session: StorySession,
      choiceId: string,
    ) =>
      transitionStory(story, session, {
        type: "select-choice",
        choiceId,
      }),
  };
}

describe("runStory initial state", () => {
  it("creates a fresh session and renders an active entry once", async () => {
    const harness = dependencies([{ status: "eof" }]);

    const result = await runStory(oneStepStory(), harness.value);

    expect(result).toMatchObject({
      status: "eof",
      session: { status: "active", step: 0, history: [] },
      view: { status: "active", nodeId: "start" },
    });
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "start",
    ]);
    expect(harness.requester.views).toHaveLength(1);
  });

  it("renders an entry ending once and requests no input", async () => {
    const harness = dependencies([]);

    const result = await runStory(entryEndingStory(), harness.value);

    expect(result).toMatchObject({
      status: "ended",
      session: { status: "ended", endingId: "immediate", step: 0 },
      view: { status: "ended", nodeId: "ending" },
    });
    expect(harness.renderer.views).toHaveLength(1);
    expect(harness.requester.views).toHaveLength(0);
  });

  it("returns useful diagnostics when session creation fails", async () => {
    const harness = dependencies([]);
    const invalidStory = {
      ...oneStepStory(),
      entryNodeId: "missing",
    };

    const result = await runStory(invalidStory, harness.value);

    expect(result).toMatchObject({
      status: "failed",
      code: "session-creation-failed",
    });
    if (result.status === "failed") {
      expect(result.message).toContain("Story session creation failed:");
      expect(result.diagnostics?.length).toBeGreaterThan(0);
    }
    expect(harness.renderer.views).toEqual([]);
    expect(harness.requester.views).toEqual([]);
  });

  it("resumes an active session without recreating its history", async () => {
    const story = multiStepStory();
    const created = createStorySession(story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const advanced = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: "advance",
    });
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) {
      return;
    }
    const initialSnapshot = structuredClone(advanced.session);
    const harness = dependencies([selected("finish")]);

    const result = await runStory(story, harness.value, {
      initialSession: advanced.session,
    });

    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "middle",
      "ending",
    ]);
    expect(result).toMatchObject({
      status: "ended",
      session: { step: 2 },
    });
    if (result.status === "ended") {
      expect(result.session.history.map((entry) => entry.choiceId)).toEqual([
        "advance",
        "finish",
      ]);
    }
    expect(advanced.session).toEqual(initialSnapshot);
  });

  it("renders and returns an already-ended resumed session", async () => {
    const story = oneStepStory();
    const created = createStorySession(story);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const finished = transitionStory(story, created.session, {
      type: "select-choice",
      choiceId: "finish",
    });
    expect(finished.ok).toBe(true);
    if (!finished.ok) {
      return;
    }
    const harness = dependencies([]);

    const result = await runStory(story, harness.value, {
      initialSession: finished.session,
    });

    expect(result).toMatchObject({
      status: "ended",
      session: { step: 1, endingId: "done" },
    });
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "ending",
    ]);
    expect(harness.requester.views).toEqual([]);
  });

  it("rejects a mismatched resumed session before rendering", async () => {
    const foreignStory = oneStepStory("foreign");
    const created = createStorySession(foreignStory);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const harness = dependencies([]);

    const result = await runStory(oneStepStory("local"), harness.value, {
      initialSession: created.session,
    });

    expect(result).toMatchObject({
      status: "failed",
      code: "session-invalid",
      engineCode: "story-mismatch",
      session: created.session,
    });
    expect(harness.renderer.views).toEqual([]);
    expect(harness.requester.views).toEqual([]);
  });

  it("rejects a forged session before input", async () => {
    const story = oneStepStory();
    const forged: StorySession = {
      storyId: story.id,
      currentNodeId: "ending",
      status: "active",
      step: 0,
      history: [],
    };
    const harness = dependencies([]);

    const result = await runStory(story, harness.value, {
      initialSession: forged,
    });

    expect(result).toMatchObject({
      status: "failed",
      code: "session-invalid",
      engineCode: "invalid-session",
    });
    expect(harness.renderer.views).toEqual([]);
    expect(harness.requester.views).toEqual([]);
  });

  it("maps an unexpected fresh-session view failure", async () => {
    const harness = dependencies([]);
    const engine = {
      ...defaultEngine(),
      getView: () =>
        ({
          ok: false,
          code: "invalid-session",
          message: "Injected view failure.",
        }) as const,
    };

    const result = await runStoryWithEngine(
      oneStepStory(),
      harness.value,
      {},
      engine,
    );

    expect(result).toMatchObject({
      status: "failed",
      code: "view-failed",
      engineCode: "invalid-session",
      message: "Injected view failure.",
    });
  });
});

describe("runStory successful traversal", () => {
  it("plays one active node through one ending", async () => {
    const events: string[] = [];
    const harness = dependencies([selected("finish")], events);

    const result = await runStory(oneStepStory(), harness.value);

    expect(events).toEqual([
      "render:start",
      "request:start",
      "render:ending",
    ]);
    expect(result).toMatchObject({
      status: "ended",
      session: {
        status: "ended",
        endingId: "done",
        step: 1,
      },
      view: {
        status: "ended",
        ending: { id: "done" },
      },
    });
    if (result.status === "ended") {
      expect(result.session.history).toEqual([
        {
          step: 1,
          fromNodeId: "start",
          choiceId: "finish",
          toNodeId: "ending",
        },
      ]);
    }
  });

  it("preserves multi-node view order and requests once per active node", async () => {
    const events: string[] = [];
    const harness = dependencies(
      [selected("advance"), selected("finish")],
      events,
    );

    const result = await runStory(multiStepStory(), harness.value);

    expect(events).toEqual([
      "render:start",
      "request:start",
      "render:middle",
      "request:middle",
      "render:ending",
    ]);
    expect(harness.requester.views).toHaveLength(2);
    expect(harness.renderer.views.filter(
      (view) => view.status === "ended",
    )).toHaveLength(1);
    expect(result).toMatchObject({
      status: "ended",
      session: { step: 2, endingId: "complete" },
    });
  });

  it("forwards custom prompt and animation preferences unchanged", async () => {
    const harness = dependencies([selected("finish")]);

    await runStory(oneStepStory(), harness.value, {
      choicePrompt: "Choose now: ",
      animateText: false,
    });

    expect(harness.requester.options).toEqual([
      { prompt: "Choose now: " },
    ]);
    expect(harness.renderer.renderOptions).toEqual([
      { animateText: false },
      { animateText: false },
    ]);
  });

  it("forwards one signal unchanged to rendering and choice requests", async () => {
    const controller = new AbortController();
    const harness = dependencies([selected("finish")]);

    await runStory(oneStepStory(), harness.value, {
      signal: controller.signal,
    });

    expect(harness.requester.options).toEqual([
      { signal: controller.signal },
    ]);
    expect(harness.renderer.renderOptions).toEqual([
      { signal: controller.signal },
      { signal: controller.signal },
    ]);
  });

  it("omits prompt and animation overrides when options are omitted", async () => {
    const harness = dependencies([selected("finish")]);

    await runStory(oneStepStory(), harness.value);

    expect(harness.requester.options).toEqual([{}]);
    expect(harness.renderer.renderOptions).toEqual([{}, {}]);
  });

  it("does not mutate story, options, or the dependency object", async () => {
    const story = oneStepStory();
    const storySnapshot = structuredClone(story);
    const options: RunStoryOptions = {
      animateText: true,
      choicePrompt: "Pick: ",
      maxInvalidAttempts: 4,
    };
    const optionsSnapshot = structuredClone(options);
    const harness = dependencies([selected("finish")]);
    const dependencyKeys = Object.keys(harness.value);

    await runStory(story, harness.value, options);

    expect(story).toEqual(storySnapshot);
    expect(options).toEqual(optionsSnapshot);
    expect(Object.keys(harness.value)).toEqual(dependencyKeys);
    expect(harness.value.renderer).toBe(harness.renderer);
    expect(harness.value.choiceRequester).toBe(harness.requester);
  });

  it("is deterministic for equal stories and scripted input", async () => {
    const first = dependencies([selected("advance"), selected("finish")]);
    const second = dependencies([selected("advance"), selected("finish")]);

    const firstResult = await runStory(multiStepStory(), first.value);
    const secondResult = await runStory(multiStepStory(), second.value);

    expect(firstResult).toEqual(secondResult);
    expect(first.renderer.views).toEqual(second.renderer.views);
  });
});

describe("runStory invalid input", () => {
  it("renders the exact input message and retries without rerendering", async () => {
    const message = '"abc" is not a valid choice number.';
    const events: string[] = [];
    const harness = dependencies(
      [invalid(message), selected("finish")],
      events,
    );

    const result = await runStory(oneStepStory(), harness.value);

    expect(events).toEqual([
      "render:start",
      "request:start",
      `input-error:${message}`,
      "request:start",
      "render:ending",
    ]);
    expect(harness.renderer.inputErrors).toEqual([message]);
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "start",
      "ending",
    ]);
    expect(result).toMatchObject({
      status: "ended",
      session: { step: 1 },
    });
  });

  it("does not transition or change history for invalid input", async () => {
    const harness = dependencies([invalid()]);
    let transitionCalls = 0;
    const baseEngine = defaultEngine();
    const engine = {
      ...baseEngine,
      transition: (
        story: StoryDocumentV1,
        session: StorySession,
        choiceId: string,
      ) => {
        transitionCalls += 1;
        return baseEngine.transition(story, session, choiceId);
      },
    };

    const result = await runStoryWithEngine(
      oneStepStory(),
      harness.value,
      { maxInvalidAttempts: 1 },
      engine,
    );

    expect(transitionCalls).toBe(0);
    expect(result).toMatchObject({
      status: "invalid-attempt-limit",
      attempts: 1,
      session: { step: 0, history: [] },
      view: { nodeId: "start" },
    });
  });

  it("uses a default limit of three consecutive invalid attempts", async () => {
    const harness = dependencies([invalid("one"), invalid("two"), invalid("three")]);

    const result = await runStory(oneStepStory(), harness.value);

    expect(result).toMatchObject({
      status: "invalid-attempt-limit",
      attempts: 3,
      session: { step: 0, history: [] },
      view: { nodeId: "start" },
    });
    expect(harness.requester.views).toHaveLength(3);
    expect(harness.renderer.inputErrors).toEqual(["one", "two", "three"]);
  });

  it("respects a custom limit and makes no extra request", async () => {
    const harness = dependencies([invalid("first"), invalid("second")]);

    const result = await runStory(oneStepStory(), harness.value, {
      maxInvalidAttempts: 2,
    });

    expect(result).toMatchObject({
      status: "invalid-attempt-limit",
      attempts: 2,
    });
    expect(harness.requester.views).toHaveLength(2);
  });

  it("resets the invalid counter after each successful transition", async () => {
    const harness = dependencies([
      invalid("start invalid"),
      selected("advance"),
      invalid("middle invalid"),
      selected("finish"),
    ]);

    const result = await runStory(multiStepStory(), harness.value, {
      maxInvalidAttempts: 2,
    });

    expect(result).toMatchObject({
      status: "ended",
      session: { step: 2 },
    });
    expect(harness.renderer.inputErrors).toEqual([
      "start invalid",
      "middle invalid",
    ]);
  });
});

describe("runStory options", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s invalid-attempt limit", async (_label, value) => {
    const harness = dependencies([]);

    const result = await runStory(oneStepStory(), harness.value, {
      maxInvalidAttempts: value,
    });

    expect(result).toEqual({
      status: "failed",
      code: "invalid-options",
      message: "maxInvalidAttempts must be a positive safe integer.",
    });
    expect(harness.renderer.views).toEqual([]);
    expect(harness.requester.views).toEqual([]);
  });
});

describe("runStory EOF", () => {
  it("returns the current active state without transitioning or output", async () => {
    const harness = dependencies([{ status: "eof" }]);

    const result = await runStory(oneStepStory(), harness.value);

    expect(result).toMatchObject({
      status: "eof",
      session: { status: "active", step: 0, history: [] },
      view: { status: "active", nodeId: "start" },
    });
    expect(harness.renderer.inputErrors).toEqual([]);
    expect(harness.renderer.transitionErrors).toEqual([]);
    expect(harness.requester.views).toHaveLength(1);
  });

  it("keeps EOF distinct from cancellation", async () => {
    const eofHarness = dependencies([{ status: "eof" }]);
    const cancelledHarness = dependencies([{ status: "cancelled" }]);

    const eofResult = await runStory(oneStepStory(), eofHarness.value);
    const cancelledResult = await runStory(
      oneStepStory(),
      cancelledHarness.value,
    );

    expect(eofResult.status).toBe("eof");
    expect(cancelledResult.status).toBe("cancelled");
  });
});

describe("runStory cancellation", () => {
  it("returns before session creation, rendering, or input when pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const harness = dependencies([]);
    const createSession = vi.fn(createStorySession);

    const result = await runStoryWithEngine(
      oneStepStory(),
      harness.value,
      { signal: controller.signal },
      { ...defaultEngine(), createSession },
    );

    expect(result).toEqual({ status: "cancelled" });
    expect(createSession).not.toHaveBeenCalled();
    expect(harness.renderer.views).toEqual([]);
    expect(harness.requester.views).toEqual([]);
  });

  it("handles cancellation during active rendering", async () => {
    const controller = new AbortController();
    const harness = dependencies([]);
    harness.renderer.onRender = () => {
      controller.abort();
      throw new CancellationError();
    };

    const result = await runStory(oneStepStory(), harness.value, {
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      status: "cancelled",
      session: { step: 0 },
    });
    expect(harness.requester.views).toEqual([]);
  });

  it("handles cancellation returned while reading input", async () => {
    const harness = dependencies([{ status: "cancelled" }]);

    const result = await runStory(oneStepStory(), harness.value);

    expect(result).toMatchObject({
      status: "cancelled",
      session: { step: 0 },
    });
    expect(harness.renderer.views).toHaveLength(1);
    expect(harness.requester.views).toHaveLength(1);
  });

  it("cancels after selection but before transition", async () => {
    const controller = new AbortController();
    const harness = dependencies([
      () => {
        controller.abort();
        return selected("finish");
      },
    ]);
    const transition = vi.fn(defaultEngine().transition);

    const result = await runStoryWithEngine(
      oneStepStory(),
      harness.value,
      { signal: controller.signal },
      { ...defaultEngine(), transition },
    );

    expect(result).toMatchObject({
      status: "cancelled",
      session: { step: 0, history: [] },
    });
    expect(transition).not.toHaveBeenCalled();
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "start",
    ]);
  });

  it("cancels after transition with the updated session before rendering again", async () => {
    const controller = new AbortController();
    const harness = dependencies([selected("finish")]);
    const baseEngine = defaultEngine();
    const engine = {
      ...baseEngine,
      transition: (
        story: StoryDocumentV1,
        session: StorySession,
        choiceId: string,
      ) => {
        const result = baseEngine.transition(story, session, choiceId);
        controller.abort();
        return result;
      },
    };

    const result = await runStoryWithEngine(
      oneStepStory(),
      harness.value,
      { signal: controller.signal },
      engine,
    );

    expect(result).toMatchObject({
      status: "cancelled",
      session: { status: "ended", step: 1, endingId: "done" },
    });
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "start",
    ]);
  });

  it("handles cancellation while rendering an ending without requesting input", async () => {
    const controller = new AbortController();
    const harness = dependencies([]);
    harness.renderer.onRender = () => {
      controller.abort();
      throw new CancellationError();
    };

    const result = await runStory(entryEndingStory(), harness.value, {
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      status: "cancelled",
      session: { status: "ended", step: 0 },
    });
    expect(harness.requester.views).toEqual([]);
  });

  it("propagates an unrelated render error even when the signal aborts", async () => {
    const controller = new AbortController();
    const harness = dependencies([]);
    const failure = new Error("unrelated render failure");
    harness.renderer.onRender = () => {
      controller.abort();
      throw failure;
    };

    await expect(
      runStory(oneStepStory(), harness.value, {
        signal: controller.signal,
      }),
    ).rejects.toBe(failure);
  });
});

describe("runStory failures", () => {
  it("renders a transition failure once and returns the prior session", async () => {
    const harness = dependencies([selected("forged-choice", 99)]);

    const result = await runStory(oneStepStory(), harness.value);

    expect(result).toMatchObject({
      status: "failed",
      code: "transition-failed",
      engineCode: "choice-not-found",
      session: { status: "active", step: 0, history: [] },
    });
    if (result.status === "failed") {
      expect(result.message).toBe(
        'Choice "forged-choice" is not available at node "start".',
      );
    }
    expect(harness.renderer.transitionErrors).toEqual([
      {
        ok: false,
        code: "choice-not-found",
        message:
          'Choice "forged-choice" is not available at node "start".',
      },
    ]);
    expect(harness.requester.views).toHaveLength(1);
  });

  it("does not swallow an unrelated transition exception", async () => {
    const failure = new Error("transition exploded");
    const harness = dependencies([selected("finish")]);

    await expect(
      runStoryWithEngine(
        oneStepStory(),
        harness.value,
        {},
        {
          ...defaultEngine(),
          transition: () => {
            throw failure;
          },
        },
      ),
    ).rejects.toBe(failure);
  });

  it("propagates an active-view renderer exception", async () => {
    const failure = new Error("renderer failed");
    const harness = dependencies([]);
    harness.renderer.onRender = () => {
      throw failure;
    };

    await expect(
      runStory(oneStepStory(), harness.value),
    ).rejects.toBe(failure);
  });

  it("propagates an ending renderer exception", async () => {
    const failure = new Error("ending renderer failed");
    const harness = dependencies([]);
    harness.renderer.onRender = () => {
      throw failure;
    };

    await expect(
      runStory(entryEndingStory(), harness.value),
    ).rejects.toBe(failure);
  });

  it("propagates a choice requester exception", async () => {
    const failure = new Error("requester failed");
    const harness = dependencies([failure]);

    await expect(
      runStory(oneStepStory(), harness.value),
    ).rejects.toBe(failure);
  });

  it("propagates an input-error renderer exception", async () => {
    const failure = new Error("input error renderer failed");
    const harness = dependencies([invalid()]);
    harness.renderer.onInputError = () => {
      throw failure;
    };

    await expect(
      runStory(oneStepStory(), harness.value),
    ).rejects.toBe(failure);
  });

  it("propagates a transition-error renderer exception", async () => {
    const failure = new Error("transition error renderer failed");
    const harness = dependencies([selected("missing")]);
    harness.renderer.onTransitionError = () => {
      throw failure;
    };

    await expect(
      runStory(oneStepStory(), harness.value),
    ).rejects.toBe(failure);
  });
});

describe("runStory cycles", () => {
  it("supports a self-loop followed by an exit", async () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "self-loop",
      title: "Self Loop",
      entryNodeId: "room",
      nodes: [
        {
          id: "room",
          text: "Again.",
          choices: [
            { id: "loop", label: "Loop", nextNodeId: "room" },
            { id: "exit", label: "Exit", nextNodeId: "ending" },
          ],
        },
        {
          id: "ending",
          text: "Out.",
          ending: { id: "out", title: "Out" },
        },
      ],
    };
    const harness = dependencies([
      selected("loop"),
      selected("loop"),
      selected("exit", 2),
    ]);

    const result = await runStory(story, harness.value);

    expect(result).toMatchObject({
      status: "ended",
      session: { step: 3 },
    });
    if (result.status === "ended") {
      expect(result.session.history.map((entry) => entry.choiceId)).toEqual([
        "loop",
        "loop",
        "exit",
      ]);
    }
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "room",
      "room",
      "room",
      "ending",
    ]);
  });

  it("supports a multi-node cycle followed by an exit", async () => {
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "multi-cycle",
      title: "Multi Cycle",
      entryNodeId: "a",
      nodes: [
        {
          id: "a",
          text: "A.",
          choices: [{ id: "to-b", label: "B", nextNodeId: "b" }],
        },
        {
          id: "b",
          text: "B.",
          choices: [
            { id: "to-a", label: "A", nextNodeId: "a" },
            { id: "exit", label: "Exit", nextNodeId: "ending" },
          ],
        },
        {
          id: "ending",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };
    const harness = dependencies([
      selected("to-b"),
      selected("to-a"),
      selected("to-b"),
      selected("exit", 2),
    ]);

    const result = await runStory(story, harness.value);

    expect(result).toMatchObject({
      status: "ended",
      session: { step: 4 },
    });
    expect(harness.renderer.views.map((view) => view.nodeId)).toEqual([
      "a",
      "b",
      "a",
      "b",
      "ending",
    ]);
  });

  it("has no hidden transition limit during a large scripted traversal", async () => {
    const loopCount = 200;
    const story: StoryDocumentV1 = {
      schemaVersion: 1,
      id: "large-loop",
      title: "Large Loop",
      entryNodeId: "room",
      nodes: [
        {
          id: "room",
          text: "Loop.",
          choices: [
            { id: "loop", label: "Loop", nextNodeId: "room" },
            { id: "exit", label: "Exit", nextNodeId: "ending" },
          ],
        },
        {
          id: "ending",
          text: "Done.",
          ending: { id: "done", title: "Done" },
        },
      ],
    };
    const scripts = [
      ...Array.from({ length: loopCount }, () => selected("loop")),
      selected("exit", 2),
    ];
    const harness = dependencies(scripts);

    const result = await runStory(story, harness.value);

    expect(result).toMatchObject({
      status: "ended",
      session: { step: loopCount + 1 },
    });
    if (result.status === "ended") {
      expect(result.session.history).toHaveLength(loopCount + 1);
      expect(result.session.history.at(-1)?.choiceId).toBe("exit");
    }
  });
});
