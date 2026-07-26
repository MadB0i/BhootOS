# Story Document v2

Story Document v2 adds deterministic flags, inventory, conditional choices,
and ordered effects. Version 1 remains supported without modification.

## Document shape

```json
{
  "schemaVersion": 2,
  "id": "example",
  "title": "Example",
  "entryNodeId": "start",
  "initialState": {
    "flags": {
      "register-read": false
    },
    "inventory": []
  },
  "nodes": [
    {
      "id": "start",
      "text": "The register is open.",
      "ending": {
        "id": "found",
        "title": "Found"
      }
    }
  ]
}
```

Flag and item IDs use the same lowercase, hyphenated identifier rules as story
and node IDs. Flag values may be booleans, strings, or finite numbers.
Inventory is a deterministic sorted set: duplicates are invalid.

## Requirements

A v2 choice or ending may contain `requires` with one condition:

- `flag-equals` compares a declared flag with a scalar value;
- `has-item` checks inventory membership;
- `not` negates one nested condition;
- `all` requires every nested condition;
- `any` requires at least one nested condition.

Conditions are limited to eight levels and 64 total conditions per requirement.
Choices whose requirements are false are absent from the player view and do not
receive an input number. Selecting a hidden choice ID fails as unavailable.

The validator rejects undeclared flag references and directly contradictory
`all` requirements. It does not attempt complete symbolic route analysis.
A condition may therefore be structurally valid but false in a particular
runtime state. If this leaves an active node with no visible choices, the
engine returns the typed `no-available-choices` failure.

## Effects

Choices may contain up to 32 `effects`, applied in document order:

- `set-flag` changes one declared flag;
- `add-item` adds an item;
- `remove-item` removes an existing item.

Adding an item already present is idempotent. Removing a missing item is a
typed runtime failure. The whole choice transition is atomic: a failed effect
returns no partially updated session.

An ending requirement is evaluated after the selected choice's effects. An
unmet ending requirement returns `ending-requirements-not-met`.

## Session and history

Version 2 sessions contain `storySchemaVersion: 2`, immutable `flags`, and
immutable sorted `inventory`. Each history entry records the selected choice,
target, applied effects, and resulting state. Session inspection replays the
history from `initialState`; forged flags, inventory, effects, hidden choices,
and discontinuous targets are rejected.

## Migrating from v1

Migration is deliberate and non-destructive:

1. change `schemaVersion` from `1` to `2`;
2. add `initialState` with declared flags and starting inventory;
3. add `requires` only where a choice or ending genuinely depends on state;
4. add small ordered `effects` arrays to choices;
5. validate and replay every ending route.

Version 1 documents continue to parse, validate, load, and play with their
existing session shape. Conceptually their flags and inventory are empty, but
v1 session objects do not gain new serialized fields.
