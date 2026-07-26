import { requestStoryChoice } from "../input/choice-input.js";
import type { ActiveStoryView } from "../engine/types.js";
import type {
  LineInput,
  RequestStoryChoiceOptions,
} from "../input/types.js";
import type { StoryViewRenderer } from "../terminal/story-view-renderer.js";
import type { StoryGameplayDependencies } from "./types.js";

export function createStoryGameplayDependencies(
  renderer: StoryViewRenderer,
  input: LineInput,
): StoryGameplayDependencies {
  return Object.freeze({
    renderer,
    choiceRequester: Object.freeze({
      request: (
        view: ActiveStoryView,
        options?: RequestStoryChoiceOptions,
      ) =>
        requestStoryChoice(input, view, options),
    }),
  });
}
