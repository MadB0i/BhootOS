# Bundled episode saves

BhootOS automatically saves `Kaun Hai?` after every successful choice. Custom
story files are deliberately not saved in this release: a file path is not a
stable story identity, and silently combining unrelated files would be unsafe.

## Commands

- `bhootos continue` resumes the active bundled run and renders its current
  node once.
- `bhootos restart` explicitly replaces the active bundled run with a new
  session. Discovered endings are preserved when the existing save is valid.
- `bhootos endings` lists four ending slots. A discovered title is shown;
  undiscovered titles appear as `???`.

Completing an ending adds it to ending history and clears the active run.
`continue` then exits with code 6 until a fresh play or restart begins.

## Location

- Windows: `%LOCALAPPDATA%\BhootOS\state.json`
- macOS: `~/Library/Application Support/BhootOS/state.json`
- Linux and other Unix platforms:
  `$XDG_DATA_HOME/bhootos/state.json`, or
  `~/.local/share/bhootos/state.json`

The save is never written into the package or story directory.

## Format and safety

Save format version 1 records the story ID and story schema version, one
optional active engine session, and a separate list of discovered ending IDs.
The file contains JSON data only. BhootOS never evaluates save or story
content.

Reads are limited to 256 KiB and require valid UTF-8 and JSON. The complete
session history, flags, inventory, current node, and ending history are checked
against the installed episode. Corrupt or mismatched saves produce an error;
they are not silently deleted.

Writes use a new, owner-restricted temporary file followed by an atomic rename.
If a write fails, the previous target remains intact. `restart` is the one
explicit recovery operation: when a save is unreadable it reports the problem,
starts clean, and cannot preserve ending history that could not be validated.
