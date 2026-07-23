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
