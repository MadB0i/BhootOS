export interface StoryDocumentV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly entryNodeId: string;
  readonly nodes: readonly StoryNodeV1[];
}

export interface StoryNodeV1 {
  readonly id: string;
  readonly text: string;
  readonly choices?: readonly StoryChoiceV1[];
  readonly ending?: StoryEndingV1;
}

export interface StoryChoiceV1 {
  readonly id: string;
  readonly label: string;
  readonly nextNodeId: string;
}

export interface StoryEndingV1 {
  readonly id: string;
  readonly title: string;
}

export type StoryFlagValue = boolean | string | number;

export interface StoryInitialStateV2 {
  readonly flags: Readonly<Record<string, StoryFlagValue>>;
  readonly inventory: readonly string[];
}

export type StoryConditionV2 =
  | {
      readonly type: "flag-equals";
      readonly flag: string;
      readonly value: StoryFlagValue;
    }
  | {
      readonly type: "has-item";
      readonly item: string;
    }
  | {
      readonly type: "not";
      readonly condition: StoryConditionV2;
    }
  | {
      readonly type: "all" | "any";
      readonly conditions: readonly StoryConditionV2[];
    };

export type StoryEffectV2 =
  | {
      readonly type: "set-flag";
      readonly flag: string;
      readonly value: StoryFlagValue;
    }
  | {
      readonly type: "add-item" | "remove-item";
      readonly item: string;
    };

export interface StoryDocumentV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly entryNodeId: string;
  readonly initialState: StoryInitialStateV2;
  readonly nodes: readonly StoryNodeV2[];
}

export interface StoryNodeV2 {
  readonly id: string;
  readonly text: string;
  readonly choices?: readonly StoryChoiceV2[];
  readonly ending?: StoryEndingV2;
}

export interface StoryChoiceV2 {
  readonly id: string;
  readonly label: string;
  readonly nextNodeId: string;
  readonly requires?: StoryConditionV2;
  readonly effects?: readonly StoryEffectV2[];
}

export interface StoryEndingV2 {
  readonly id: string;
  readonly title: string;
  readonly requires?: StoryConditionV2;
}

export type StoryDocument = StoryDocumentV1 | StoryDocumentV2;
export type StoryNode = StoryNodeV1 | StoryNodeV2;
export type StoryChoice = StoryChoiceV1 | StoryChoiceV2;
export type StoryEnding = StoryEndingV1 | StoryEndingV2;
