export class CancellationError extends Error {
  override readonly name = "CancellationError";

  constructor(message?: string) {
    super(message ?? "Operation was cancelled");
  }
}

export function isCancellationError(error: unknown): error is CancellationError {
  return error instanceof CancellationError;
}

export class SchedulerDelayError extends TypeError {
  override readonly name = "SchedulerDelayError";

  constructor(milliseconds: number) {
    super(`Delay must be finite, got ${String(milliseconds)}`);
  }
}

export interface Scheduler {
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

export function createScheduler(): Scheduler {
  return {
    sleep(ms: number, signal?: AbortSignal): Promise<void> {
      if (!Number.isFinite(ms)) {
        return Promise.reject(new SchedulerDelayError(ms));
      }

      if (ms <= 0) {
        if (signal?.aborted === true) {
          return Promise.reject(new CancellationError());
        }
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false;

        function removeAbortListener(): void {
          signal?.removeEventListener("abort", onAbort);
        }

        const timer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          removeAbortListener();
          resolve();
        }, ms);

        function onAbort(): void {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          removeAbortListener();
          reject(new CancellationError());
        }

        if (signal !== undefined) {
          if (signal.aborted === true) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    },
  };
}
