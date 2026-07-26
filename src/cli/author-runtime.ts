import {
  mkdir,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { loadStory } from "../story/load-story.js";
import { createNodeStoryFileReader } from "../story/node-file-reader.js";

const STORY_NAME_PATTERN = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/u;

export const AUTHOR_EXIT_CODES = Object.freeze({
  ok: 0,
  invalidStory: 2,
  invalidName: 8,
  createFailed: 9,
} as const);

export interface AuthorFileSystem {
  mkdir(
    path: string,
    options: { readonly recursive: false; readonly mode: number },
  ): Promise<unknown>;
  writeFile(
    path: string,
    data: string,
    options: {
      readonly encoding: "utf8";
      readonly flag: "wx";
      readonly mode: number;
    },
  ): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
  rmdir(path: string): Promise<unknown>;
}

const NODE_AUTHOR_FILE_SYSTEM: AuthorFileSystem = Object.freeze({
  mkdir,
  writeFile,
  unlink,
  rmdir,
});

export async function validateStoryCommand(
  sourceName: string,
  output: {
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
  },
): Promise<number> {
  const loaded = await loadStory(createNodeStoryFileReader(), sourceName);
  if (!loaded.ok) {
    output.stderr(
      `bhootos: ${loaded.message.replace(/\.$/u, "")}\n${(loaded.diagnostics ?? [])
        .map(
          (diagnostic) =>
            `  ${diagnostic.path} [${diagnostic.code}] ${diagnostic.message}`,
        )
        .join("\n")}${(loaded.diagnostics?.length ?? 0) > 0 ? "\n" : ""}`,
    );
    return AUTHOR_EXIT_CODES.invalidStory;
  }

  const endingCount = loaded.story.nodes.filter(
    (node) => node.ending !== undefined,
  ).length;
  output.stdout(
    [
      "Valid BhootOS story",
      `Schema: ${String(loaded.story.schemaVersion)}`,
      `Nodes: ${String(loaded.story.nodes.length)}`,
      `Endings: ${String(endingCount)}`,
      "",
    ].join("\n"),
  );
  return AUTHOR_EXIT_CODES.ok;
}

export async function createStoryCommand(
  name: string,
  workingDirectory: string,
  output: {
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
  },
  fileSystem: AuthorFileSystem = NODE_AUTHOR_FILE_SYSTEM,
): Promise<number> {
  if (!STORY_NAME_PATTERN.test(name)) {
    output.stderr(
      "bhootos: Story name must use lowercase letters, digits, and single internal hyphens.\n",
    );
    return AUTHOR_EXIT_CODES.invalidName;
  }

  const root = resolve(workingDirectory);
  const destination = resolve(root, name);
  if (dirname(destination) !== root) {
    output.stderr("bhootos: Story destination must stay in the current directory.\n");
    return AUTHOR_EXIT_CODES.invalidName;
  }

  try {
    await fileSystem.mkdir(destination, { recursive: false, mode: 0o700 });
  } catch (error: unknown) {
    output.stderr(
      fileSystemCode(error) === "EEXIST"
        ? `bhootos: Destination already exists: ${name}\n`
        : `bhootos: Could not create story directory: ${name}\n`,
    );
    return AUTHOR_EXIT_CODES.createFailed;
  }

  const storyPath = join(destination, "story.json");
  const readmePath = join(destination, "README.md");
  const createdPaths: string[] = [];
  try {
    await fileSystem.writeFile(storyPath, starterStory(name), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    createdPaths.push(storyPath);
    await fileSystem.writeFile(readmePath, starterReadme(name), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    createdPaths.push(readmePath);
  } catch {
    await cleanupCreatedStory(fileSystem, createdPaths, destination);
    output.stderr(`bhootos: Could not create starter files for ${name}.\n`);
    return AUTHOR_EXIT_CODES.createFailed;
  }

  output.stdout(
    `Created ${name}/story.json\nPlay it with: bhootos play ./${name}/story.json\n`,
  );
  return AUTHOR_EXIT_CODES.ok;
}

function starterStory(name: string): string {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      id: name,
      title: titleFromName(name),
      description: "A small terminal story.",
      entryNodeId: "start",
      initialState: {
        flags: {},
        inventory: [],
      },
      nodes: [
        {
          id: "start",
          text: "The terminal waits for a decision.",
          choices: [
            {
              id: "answer",
              label: "Answer",
              nextNodeId: "ending",
            },
          ],
        },
        {
          id: "ending",
          text: "The terminal records your answer and goes quiet.",
          ending: {
            id: "answered",
            title: "Answered",
          },
        },
      ],
    },
    null,
    2,
  )}\n`;
}

function starterReadme(name: string): string {
  return `# ${titleFromName(name)}\n\nEdit \`story.json\`, then run:\n\n\`\`\`sh\nbhootos validate ./story.json\nbhootos play ./story.json\n\`\`\`\n`;
}

function titleFromName(name: string): string {
  return name
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

async function cleanupCreatedStory(
  fileSystem: AuthorFileSystem,
  createdPaths: readonly string[],
  destination: string,
): Promise<void> {
  for (const path of [...createdPaths].reverse()) {
    try {
      await fileSystem.unlink(path);
    } catch {
      // Only files created by this command are cleanup candidates.
    }
  }
  try {
    await fileSystem.rmdir(destination);
  } catch {
    // A concurrent writer may have added content; never remove it recursively.
  }
}

function fileSystemCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}
