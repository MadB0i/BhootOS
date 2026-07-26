export interface OutputStream {
  write(text: string): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export interface SafeOutput {
  readonly write: (text: string) => void;
  isBrokenPipe(): boolean;
  failure(): Error | undefined;
}

export function createSafeOutput(
  stream: OutputStream,
  onExitCodeChange?: (exitCode: 0 | 1) => void,
): SafeOutput {
  let brokenPipe = false;
  let failure: Error | undefined;

  const recordError = (error: Error): void => {
    if (fileSystemCode(error) === "EPIPE") {
      brokenPipe = true;
      onExitCodeChange?.(0);
      return;
    }
    failure ??= error;
    onExitCodeChange?.(1);
  };
  stream.on("error", recordError);

  return Object.freeze({
    write(text: string): void {
      if (brokenPipe || failure !== undefined) {
        return;
      }
      try {
        stream.write(text);
      } catch (error: unknown) {
        const normalized =
          error instanceof Error ? error : new Error("Output write failed.");
        recordError(normalized);
        if (fileSystemCode(normalized) !== "EPIPE") {
          throw normalized;
        }
      }
    },
    isBrokenPipe: () => brokenPipe,
    failure: () => failure,
  });
}

function fileSystemCode(error: Error): string | undefined {
  if (!("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}
