import { fileURLToPath } from "node:url";

const BUNDLED_EPISODE_RELATIVE_URL =
  "../episodes/kaun-hai/story.json";

export function resolveBundledEpisodePath(
  cliModuleUrl: string | URL,
): string {
  return fileURLToPath(
    new URL(BUNDLED_EPISODE_RELATIVE_URL, cliModuleUrl),
  );
}
