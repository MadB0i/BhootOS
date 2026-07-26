# Releasing

No release is created automatically from pull requests or branch pushes.
Publishing is triggered only by a tag matching `v*`. The workflow rejects the
tag before installation unless all of these conditions hold:

* `package.json` contains a stable `x.y.z` version;
* the tag is exactly `v<package version>`;
* the tagged commit is an ancestor of `origin/main`.

Prerelease versions are intentionally not published by this workflow.

Before tagging:

1. update `package.json` and `CHANGELOG.md`;
2. run `pnpm install --frozen-lockfile` and `pnpm check`;
3. inspect `npm pack --dry-run`;
4. confirm the stable tag matches the package version, for example `v0.1.0`;
5. push the reviewed commit, then push the tag.

The GitHub `npm` environment must contain an `NPM_TOKEN` secret authorized for
this package. The workflow grants only repository read access and OIDC
`id-token: write`, installs the immutable lockfile with pnpm 9.15.4, repeats the
complete check, and publishes with npm provenance.

Do not expose the token in repository files, workflow output, or local demo
recordings. A maintainer should protect the `npm` environment with required
reviewers when the repository plan supports it.
