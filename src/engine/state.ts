import type {
  StoryConditionV2,
  StoryDocument,
  StoryEffectV2,
  StoryFlagValue,
} from "../story/types.js";
import type { StoryRuntimeState } from "./types.js";

export type EffectApplicationResult =
  | {
      readonly ok: true;
      readonly state: StoryRuntimeState;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export function initialRuntimeState(
  story: StoryDocument,
): StoryRuntimeState | undefined {
  return story.schemaVersion === 1
    ? undefined
    : freezeRuntimeState(
        story.initialState.flags,
        story.initialState.inventory,
      );
}

export function evaluateCondition(
  condition: StoryConditionV2,
  state: StoryRuntimeState,
): boolean {
  switch (condition.type) {
    case "flag-equals":
      return state.flags[condition.flag] === condition.value;
    case "has-item":
      return state.inventory.includes(condition.item);
    case "not":
      return !evaluateCondition(condition.condition, state);
    case "all":
      return condition.conditions.every((nested) =>
        evaluateCondition(nested, state),
      );
    case "any":
      return condition.conditions.some((nested) =>
        evaluateCondition(nested, state),
      );
  }
}

export function applyEffects(
  effects: readonly StoryEffectV2[],
  state: StoryRuntimeState,
): EffectApplicationResult {
  const flags: Record<string, StoryFlagValue> = { ...state.flags };
  const inventory = new Set(state.inventory);

  for (const effect of effects) {
    switch (effect.type) {
      case "set-flag":
        if (!Object.prototype.hasOwnProperty.call(flags, effect.flag)) {
          return Object.freeze({
            ok: false,
            message: `Effect references undeclared flag "${effect.flag}".`,
          });
        }
        flags[effect.flag] = effect.value;
        break;
      case "add-item":
        inventory.add(effect.item);
        break;
      case "remove-item":
        if (!inventory.has(effect.item)) {
          return Object.freeze({
            ok: false,
            message: `Cannot remove missing inventory item "${effect.item}".`,
          });
        }
        inventory.delete(effect.item);
        break;
    }
  }

  return Object.freeze({
    ok: true,
    state: freezeRuntimeState(flags, [...inventory]),
  });
}

export function freezeRuntimeState(
  flags: Readonly<Record<string, StoryFlagValue>>,
  inventory: readonly string[],
): StoryRuntimeState {
  const stableFlags: Record<string, StoryFlagValue> = {};
  for (const flag of Object.keys(flags).sort()) {
    const value = flags[flag];
    if (value !== undefined) {
      Object.defineProperty(stableFlags, flag, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return Object.freeze({
    flags: Object.freeze(stableFlags),
    inventory: Object.freeze([...new Set(inventory)].sort()),
  });
}

export function runtimeStatesEqual(
  left: StoryRuntimeState,
  right: StoryRuntimeState,
): boolean {
  return (
    JSON.stringify(left.flags) === JSON.stringify(right.flags) &&
    JSON.stringify(left.inventory) === JSON.stringify(right.inventory)
  );
}

export function cloneEffects(
  effects: readonly StoryEffectV2[],
): readonly StoryEffectV2[] {
  return Object.freeze(
    effects.map((effect) => Object.freeze({ ...effect })),
  );
}
