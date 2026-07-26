# Story loading

BhootOS provides a platform-neutral boundary for reading text, parsing Story
Document v1 JSON, and returning a validated immutable story. Loading is
separate from gameplay, presentation, and the CLI.

There is no `bhootos play` command yet.

## Reader boundary

`loadStory` receives an injected `StoryTextReader`:

```ts
interface StoryTextReader {
  read(
    source: string,
    options?: {
      readonly signal?: AbortSignal;
      readonly maxBytes?: number;
    },
  ): Promise<StoryTextReadResult>;
}
```

The reader owns source access. The platform-neutral loader does not access the
filesystem, process state, terminal, environment, network, or real streams.
This lets embedders load from their own controlled text source without changing
the parser or engine.

## Example

```ts
import {
  loadStory,
  type StoryTextReader,
} from "bhootos";

const reader: StoryTextReader = {
  read: async (source, options) => {
    const text = suppliedSources.get(source);
    if (text === undefined) {
      return {
        ok: false,
        code: "file-not-found",
        sourceName: source,
        message: `Story source was not found: ${source}`,
      };
    }

    const bytes = new TextEncoder().encode(text);
    if (
      options?.maxBytes !== undefined &&
      bytes.byteLength > options.maxBytes
    ) {
      return {
        ok: false,
        code: "file-too-large",
        sourceName: source,
        message:
          `Story source exceeds the ${options.maxBytes}-byte limit.`,
      };
    }

    return {
      ok: true,
      sourceName: source,
      text,
      byteLength: bytes.byteLength,
    };
  },
};

const loaded = await loadStory(reader, "house.json");
if (!loaded.ok) {
  console.error(loaded.sourceName, loaded.message);
} else {
  console.log(loaded.story.title);
}
```

Unexpected reader exceptions propagate unchanged. Expected access problems
should be returned as typed reader failures.

## Size protection

`DEFAULT_STORY_FILE_MAX_BYTES` is `1,048,576` bytes (1 MiB). `maxBytes` must be
a positive safe integer. Invalid values return a configuration-stage
`invalid-options` failure before reading.

The internal Node reader checks filesystem metadata before reading and verifies
the actual byte length afterward. This protects against file changes and
inaccurate metadata. A file exactly equal to the limit is accepted. Oversized
content is never truncated or parsed.

## UTF-8 and BOM policy

The Node reader uses fatal UTF-8 decoding. Malformed byte sequences return
`invalid-utf8`; they are never replaced with the Unicode replacement
character.

A single leading UTF-8 BOM is accepted and removed during decoding. Its three
bytes remain included in `byteLength`. All other content—including Unicode,
Unix or Windows line endings, surrounding whitespace, and a missing final
newline—is preserved exactly.

## Loading pipeline

`loadStory`:

1. checks cancellation and validates `maxBytes`;
2. requests text once from the injected reader;
3. stops immediately on read failure or oversize content;
4. passes the exact decoded text and reader-provided source name to
   `parseStoryJson`;
5. reuses the existing structural and graph validation path; and
6. returns a story only when no error diagnostics remain.

JSON syntax errors return stage `parse` and code `invalid-json`. Structural,
schema, identifier, and graph failures return stage `validation` and code
`invalid-story`. The result keeps `sourceName` separately while every
diagnostic retains its JSON path, such as
`$.nodes[2].choices[0].nextNodeId`.

Warnings from the existing validator may accompany a successful load.

## Read errors

Reader error codes are:

| Code | Meaning |
| --- | --- |
| `invalid-source` | The source name or path is empty or unusable. |
| `invalid-options` | Reader configuration is invalid. |
| `file-not-found` | No file exists at the supplied path. |
| `not-a-file` | The supplied path resolves to a directory or another non-file. |
| `permission-denied` | The operating system denied access. |
| `file-too-large` | Metadata or actual bytes exceed the configured limit. |
| `invalid-utf8` | File bytes are not valid UTF-8. |
| `read-cancelled` | Reading stopped because of cancellation. |
| `read-failed` | Another coded filesystem failure occurred. |

Loader failures use `invalid-options`, `read-failed`, `invalid-json`,
`invalid-story`, or `cancelled`. Read-stage failures preserve the specific
reader code in `readCode`.

Messages are concise; parser and validator detail remains in `diagnostics`.
Neither reader nor loader returns stack traces.

## Cancellation

Cancellation is checked before option validation, before source access, after
reading, before parsing, and before returning success. The Node adapter also
observes cancellation while metadata or file reads are pending.

Every cancellation becomes the same loader result: code `cancelled`, read code
`read-cancelled`, and no partial story. Unrelated reader or parser defects are
not disguised as cancellation.

## Node adapter visibility

The Node filesystem reader is intentionally internal (Option A). It accepts
absolute or relative caller-supplied paths, reads exactly that single path, and
does no directory discovery or manifest lookup. Its result preserves the
supplied path rather than exposing a separately normalized absolute path.

Filesystem `stat` follows symbolic links, so a link to a regular file is
allowed. This boundary is not a security sandbox: the caller explicitly
chooses the path.

The package root and `dist/index.js` do not import `node:fs`; no `bhootos/node`
subpath is published. A future CLI can compose the internal adapter without
expanding the platform-neutral public surface.

BhootOS can validate loaded stories through its library API, but it cannot play
story files from the CLI yet.
