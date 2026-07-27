# Releasing

BhootOS does not currently automate releases or publish a package to npm.
The repository has no tag-triggered release workflow, package-publishing
credential requirement, or npm deployment environment.

Normal development remains supported through the GitHub Actions CI matrix on
Ubuntu and Windows with Node.js 20 and 24. Every proposed release change should
use the same source verification flow:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
node scripts/verify-installed.mjs
```

The package dry run and installed-tarball checks remain part of project
verification, but they do not publish anything. If distribution policy changes
in the future, it requires a separately reviewed design and configuration
change; pushing a tag or branch does not create a release.
