# Contributing to BhootOS

Please keep changes restrained, deterministic, and small enough to review.
BhootOS is both a player-facing terminal story and a reusable story runtime;
changes should respect both uses.

## Setup

Use Node.js 20 or newer and the pinned pnpm 9.15.4:

```sh
pnpm install --frozen-lockfile
pnpm check
```

Before submitting a change, add focused tests, run `pnpm check`, inspect
`npm pack --dry-run`, and confirm that `dist/index.js` has not acquired Node
filesystem or process-stream dependencies.

## Code

- Preserve strict TypeScript and `exactOptionalPropertyTypes`.
- Keep public functions deterministic and expected failures typed.
- Inject filesystem, stream, timing, and environment boundaries.
- Treat story and save files as data. Never execute their content.
- Preserve Story Document v1 compatibility unless a future major release
  explicitly changes it.
- Do not add dependencies for behavior that is clear and safer in a small local
  module.

## Stories and visible text

Do not rewrite good prose for stylistic churn. New story text should remain
restrained, culturally specific where appropriate, and respectful of religion
and worship. Avoid generic glitch effects, gore shorthand, neon-hacker
language, and jokes during strong horror beats.

Run all scripted ending routes when changing the bundled episode. Update its
authoring notes when state or continuity changes.

## Pull requests

Explain the user-visible outcome, compatibility impact, tests run, and any
deliberate limitation. Do not include generated saves, coverage, package
tarballs, or demo recordings.
