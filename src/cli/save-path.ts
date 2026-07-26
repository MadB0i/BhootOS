import { posix, win32 } from "node:path";

export interface UserDataEnvironment {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
}

export function resolveBhootOsSavePath(environment: UserDataEnvironment): string {
  if (environment.platform === "win32") {
    const base = environment.env["LOCALAPPDATA"];
    if (base !== undefined && base.length > 0) {
      return win32.join(base, "BhootOS", "state.json");
    }
  }
  if (environment.platform === "darwin") {
    return posix.join(
      environment.homeDirectory,
      "Library",
      "Application Support",
      "BhootOS",
      "state.json",
    );
  }

  const xdgDataHome = environment.env["XDG_DATA_HOME"];
  return posix.join(
    xdgDataHome !== undefined && xdgDataHome.length > 0
      ? xdgDataHome
      : posix.join(environment.homeDirectory, ".local", "share"),
    "bhootos",
    "state.json",
  );
}
