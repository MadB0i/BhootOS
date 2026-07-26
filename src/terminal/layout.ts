const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const MIN_CONTENT_WIDTH = 28;
const MAX_CONTENT_WIDTH = 88;

export function terminalContentWidth(columns: number | undefined): number | undefined {
  if (!Number.isSafeInteger(columns) || (columns ?? 0) < 1) {
    return undefined;
  }
  return Math.max(MIN_CONTENT_WIDTH, Math.min(MAX_CONTENT_WIDTH, columns! - 2));
}

export function visibleWidth(text: string): number {
  return [...text.replace(ANSI_ESCAPE, "")].length;
}

export function formatNarrative(text: string, width: number | undefined): string {
  if (width === undefined) {
    return text;
  }
  return text
    .split("\n")
    .map((line) =>
      line.length === 0
        ? ""
        : wrapWithPrefixes(line, width, "  ", "  ").join("\n"),
    )
    .join("\n");
}

export function formatChoice(
  number: number,
  label: string,
  width: number | undefined,
): readonly string[] {
  const prefix = `  ${String(number)}. `;
  if (width === undefined) {
    return [`${prefix}${label}`];
  }
  return wrapWithPrefixes(label, width, prefix, " ".repeat(prefix.length));
}

function wrapWithPrefixes(
  text: string,
  width: number,
  firstPrefix: string,
  continuationPrefix: string,
): readonly string[] {
  const words = text.trim().split(/\s+/u);
  const lines: string[] = [];
  let prefix = firstPrefix;
  let line = prefix;

  for (const word of words) {
    const separator = line === prefix ? "" : " ";
    if (visibleWidth(line + separator + word) <= width) {
      line += separator + word;
      continue;
    }
    if (line !== prefix) {
      lines.push(line);
      prefix = continuationPrefix;
      line = prefix;
    }
    const available = Math.max(1, width - visibleWidth(prefix));
    const characters = [...word];
    while (characters.length > available) {
      lines.push(prefix + characters.splice(0, available).join(""));
      prefix = continuationPrefix;
    }
    line = prefix + characters.join("");
  }

  lines.push(line);
  return Object.freeze(lines);
}
