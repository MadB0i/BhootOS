import type { TerminalCapabilities } from "./terminal/capabilities.js";
import { createTheme } from "./terminal/theme.js";
import { TerminalRenderer } from "./terminal/renderer.js";
import type { Scheduler } from "./terminal/scheduler.js";
import {
  DEFAULT_CHARACTER_DELAY_MS,
  DEFAULT_PUNCTUATION_DELAY_MS,
} from "./terminal/typewriter.js";

export interface AppIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface AppOptions {
  io: AppIO;
  capabilities: TerminalCapabilities;
  fast?: boolean;
  scheduler?: Scheduler;
}

export interface DoctorOptions {
  io: AppIO;
  capabilities: TerminalCapabilities;
  platform: string;
  nodeVersion: string;
}

export async function runApp(options: AppOptions): Promise<void> {
  const renderer = new TerminalRenderer({
    stdout: options.io.stdout,
    stderr: options.io.stderr,
    capabilities: options.capabilities,
    fast: options.fast ?? false,
    ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
  });
  renderer.clear();
  renderer.renderBootScreen();

  await renderer.typewriteFrameLine("Kaun hai wahan?", {
    characterDelayMs: DEFAULT_CHARACTER_DELAY_MS,
    punctuationDelayMs: DEFAULT_PUNCTUATION_DELAY_MS,
  });
  renderer.renderBootScreenFooter();
}

export function doctorReport(options: DoctorOptions): void {
  const caps = options.capabilities;
  const theme = createTheme(caps);
  const out = options.io.stdout;

  out(theme.title("BhootOS Terminal Doctor") + "\n");
  out(`Interactive: ${caps.isInteractive ? "yes" : "no"}\n`);
  out(`Color: ${caps.supportsColor ? "yes" : "no"}\n`);
  out(`Unicode: ${caps.supportsUnicode ? "yes" : "no"}\n`);
  out(`Terminal control: ${caps.supportsTerminalControl ? "yes" : "no"}\n`);
  out(`Reduced motion: ${caps.reducedMotion ? "yes" : "no"}\n`);
  out(`Platform: ${options.platform}\n`);
  out(`Node: ${options.nodeVersion}\n`);
}
