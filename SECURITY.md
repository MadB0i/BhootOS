# Security policy

## Supported version

BhootOS is pre-1.0 and is currently distributed from source. Security fixes
are applied to the current main branch.

## Reporting

Please report a suspected vulnerability privately through GitHub's security
advisory feature for this repository. Do not include secrets, personal save
files, or unrelated system data. If private advisories are unavailable, open a
minimal issue asking the maintainer for a private contact channel without
publishing exploit details.

## Security boundaries

Story and save files are untrusted JSON data. BhootOS does not evaluate code,
run story-provided commands, load dynamic modules from stories, make network
requests, collect telemetry, or store secrets.

Custom story paths are explicitly supplied by the user and are not a sandbox:
symbolic links to regular files are followed. `create-story` accepts only a
single canonical identifier beneath the current directory and refuses existing
targets. Bundled saves use a fixed platform user-data path, a 256 KiB limit,
session replay validation, an exclusive temporary file, and atomic rename.

The public package entry is platform-neutral. Node filesystem and process
stream access is confined to CLI adapters.
