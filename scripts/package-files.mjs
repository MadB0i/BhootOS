const EXPECTED_PACKAGE_ENTRY_COUNT = 11;

const STABLE_PACKAGE_FILES = Object.freeze([
  "LICENSE",
  "README.md",
  "dist/cli.js",
  "dist/cli.js.map",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/index.js.map",
  "episodes/kaun-hai/story.json",
  "package.json",
]);

const CHUNK_JAVASCRIPT_PATTERN = /^dist\/chunk-[A-Z0-9]+\.js$/u;
const CHUNK_SOURCE_MAP_PATTERN = /^dist\/chunk-[A-Z0-9]+\.js\.map$/u;

export function validatePackageFiles(files) {
  if (
    !Array.isArray(files) ||
    files.some((file) => typeof file !== "string")
  ) {
    throw new TypeError("Package files must be an array of paths.");
  }

  const stableFiles = new Set(STABLE_PACKAGE_FILES);
  const packageFiles = new Set(files);
  const missingStableFiles = STABLE_PACKAGE_FILES.filter(
    (file) => !packageFiles.has(file),
  );
  const unexpectedFiles = [];
  const javascriptChunks = [];
  const sourceMapChunks = [];

  for (const file of files) {
    if (stableFiles.has(file)) {
      continue;
    }
    if (CHUNK_JAVASCRIPT_PATTERN.test(file)) {
      javascriptChunks.push(file);
      continue;
    }
    if (CHUNK_SOURCE_MAP_PATTERN.test(file)) {
      sourceMapChunks.push(file);
      continue;
    }
    unexpectedFiles.push(file);
  }

  const duplicateFiles = files.filter(
    (file, index) => files.indexOf(file) !== index,
  );
  unexpectedFiles.push(
    ...duplicateFiles.map((file) => `${file} (duplicate entry)`),
  );

  const invalidChunkFiles = [];
  if (javascriptChunks.length !== 1) {
    invalidChunkFiles.push(
      `expected exactly one dist/chunk-[A-Z0-9]+.js, found ${String(javascriptChunks.length)}: ${formatInline(javascriptChunks)}`,
    );
  }
  if (sourceMapChunks.length !== 1) {
    invalidChunkFiles.push(
      `expected exactly one dist/chunk-[A-Z0-9]+.js.map, found ${String(sourceMapChunks.length)}: ${formatInline(sourceMapChunks)}`,
    );
  }
  if (
    javascriptChunks.length === 1 &&
    sourceMapChunks.length === 1 &&
    sourceMapChunks[0] !== `${javascriptChunks[0]}.map`
  ) {
    invalidChunkFiles.push(
      `expected source map "${javascriptChunks[0]}.map" for "${javascriptChunks[0]}", found "${sourceMapChunks[0]}"`,
    );
  }

  if (
    missingStableFiles.length === 0 &&
    unexpectedFiles.length === 0 &&
    invalidChunkFiles.length === 0 &&
    files.length === EXPECTED_PACKAGE_ENTRY_COUNT
  ) {
    return;
  }

  throw new Error(
    [
      "Invalid package contents.",
      `Expected ${String(EXPECTED_PACKAGE_ENTRY_COUNT)} package entries, received ${String(files.length)}.`,
      formatSection("Missing stable files", missingStableFiles),
      formatSection("Unexpected files", unexpectedFiles),
      formatSection("Invalid or unmatched chunk files", invalidChunkFiles),
    ].join("\n"),
  );
}

function formatSection(title, values) {
  return `${title}:\n${
    values.length === 0
      ? "  (none)"
      : values.map((value) => `  - ${value}`).join("\n")
  }`;
}

function formatInline(values) {
  return values.length === 0 ? "(none)" : values.join(", ");
}
