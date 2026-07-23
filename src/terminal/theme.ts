import { Chalk } from "chalk";
import type { TerminalCapabilities } from "./capabilities.js";

export interface Theme {
  title: (text: string) => string;
  danger: (text: string) => string;
}

export function createTheme(caps: TerminalCapabilities): Theme {
  const chalk = new Chalk({ level: caps.supportsColor ? 1 : 0 });

  return {
    title: (t) => chalk.bold(t),
    danger: (t) => chalk.red(t),
  };
}
