export interface TerminalCapabilities {
  readonly isInteractive: boolean;
  readonly supportsColor: boolean;
  readonly supportsUnicode: boolean;
  readonly supportsTerminalControl: boolean;
  readonly reducedMotion: boolean;
}

export interface EnvInfo {
  readonly isTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly noColor?: boolean;
  readonly forceAscii?: boolean;
  readonly reducedMotion?: boolean;
}

export function detectTerminalCapabilities(info: EnvInfo): TerminalCapabilities {
  const isInteractive = info.isTTY;
  const reducedMotion = info.reducedMotion ?? false;
  const supportsTerminalControl = info.isTTY && info.env["TERM"] !== "dumb";

  let supportsColor: boolean;

  if (info.noColor === true) {
    supportsColor = false;
  } else if (info.env["NO_COLOR"] !== undefined && info.env["NO_COLOR"] !== "") {
    supportsColor = false;
  } else if (info.env["FORCE_COLOR"] === "0") {
    supportsColor = false;
  } else if (info.env["FORCE_COLOR"] !== undefined && info.env["FORCE_COLOR"] !== "0") {
    supportsColor = true;
  } else if (!info.isTTY) {
    supportsColor = false;
  } else if (info.env["TERM"] === "dumb") {
    supportsColor = false;
  } else {
    supportsColor = true;
  }

  let supportsUnicode: boolean;

  if (info.forceAscii === true) {
    supportsUnicode = false;
  } else if (info.env["TERM"] === "dumb") {
    supportsUnicode = false;
  } else {
    supportsUnicode = true;
  }

  return {
    isInteractive,
    supportsColor,
    supportsUnicode,
    supportsTerminalControl,
    reducedMotion,
  };
}
