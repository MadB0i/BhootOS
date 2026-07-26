import type { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type {
  LineInput,
  ReadLineOptions,
  ReadLineResult,
} from "./types.js";

export interface NodeLineInputOptions {
  readonly input: Readable;
  readonly output: Writable;
}

export class NodeLineInput implements LineInput {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private reading = false;
  private ended = false;

  constructor(options: NodeLineInputOptions) {
    this.input = options.input;
    this.output = options.output;
  }

  readLine(options: ReadLineOptions = {}): Promise<ReadLineResult> {
    if (options.signal?.aborted === true) {
      return Promise.resolve(Object.freeze({ status: "cancelled" }));
    }
    if (this.reading) {
      return Promise.reject(
        new Error("NodeLineInput cannot read more than one line concurrently."),
      );
    }

    this.reading = true;
    return new Promise<ReadLineResult>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        this.input.removeListener("data", onData);
        this.input.removeListener("end", onEnd);
        this.input.removeListener("close", onClose);
        this.input.removeListener("error", onInputError);
        this.output.removeListener("error", onOutputError);
        options.signal?.removeEventListener("abort", onAbort);
        this.input.pause();
        this.reading = false;
      };

      const finish = (result: ReadLineResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(Object.freeze(result));
      };

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      const takeBufferedLine = (): boolean => {
        const newlineIndex = this.buffer.indexOf("\n");
        if (newlineIndex < 0) {
          return false;
        }

        let line = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }
        finish({ status: "line", value: line });
        return true;
      };

      const finishAtEnd = (): void => {
        if (settled) {
          return;
        }
        this.ended = true;
        this.buffer += this.decoder.end();
        if (takeBufferedLine()) {
          return;
        }
        if (this.buffer.length > 0) {
          const line = this.buffer;
          this.buffer = "";
          finish({ status: "line", value: line });
          return;
        }
        finish({ status: "eof" });
      };

      const onData = (chunk: unknown): void => {
        if (typeof chunk === "string") {
          this.buffer += chunk;
        } else if (chunk instanceof Uint8Array) {
          this.buffer += this.decoder.write(chunk);
        } else {
          fail(new TypeError("Line input stream emitted non-text data."));
          return;
        }
        takeBufferedLine();
      };

      const onEnd = (): void => finishAtEnd();
      const onClose = (): void => finishAtEnd();
      const onInputError = (error: Error): void => fail(error);
      const onOutputError = (error: Error): void => fail(error);
      const onAbort = (): void => finish({ status: "cancelled" });

      this.input.on("data", onData);
      this.input.once("end", onEnd);
      this.input.once("close", onClose);
      this.input.once("error", onInputError);
      this.output.once("error", onOutputError);
      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        if (options.prompt !== undefined) {
          this.output.write(options.prompt);
        }
      } catch (error: unknown) {
        fail(asError(error));
        return;
      }

      if (options.signal?.aborted === true) {
        finish({ status: "cancelled" });
        return;
      }
      if (takeBufferedLine()) {
        return;
      }
      if (
        this.ended ||
        this.input.readableEnded ||
        this.input.destroyed
      ) {
        finishAtEnd();
        return;
      }

      this.input.resume();
    });
  }
}

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Line input failed with a non-error value.");
}
