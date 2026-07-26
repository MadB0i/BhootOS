# Changelog

All notable changes are documented here. BhootOS has not published a stable
release yet.

## Unreleased

### Added

- package-relative no-argument play for the bundled `Kaun Hai?` episode;
- Story Document v2 flags, inventory, requirements, effects, and ending gates;
- immutable stateful engine transitions and replay-validated history;
- versioned atomic bundled saves with `continue`, `restart`, and `endings`;
- `validate` and traversal-safe `create-story` author commands;
- Enter/Space animation skipping with terminal-state restoration;
- narrow-terminal narrative and choice wrapping;
- root bundled play with the full boot retained as `intro`;
- Windows/Ubuntu CI on Node 20 and 24;
- tag-only npm publishing with provenance.

### Changed

- `Kaun Hai?` now uses collected evidence to gate its strongest ending.
- CLI help and documentation now describe the complete player and author
  workflow.

### Compatibility

- Story Document v1 parsing, validation, loading, traversal, and gameplay remain
  supported.
- Explicit `bhootos play <story-file>` behavior remains available.
