import type { TerminalCapabilities } from "./capabilities.js";
import { createTheme, type Theme } from "./theme.js";
import { CancellationError, createScheduler, type Scheduler } from "./scheduler.js";
import { Typewriter, type TypewriterOptions } from "./typewriter.js";

const FRAME_CONTENT_WIDTH = 44;
const FRAME_PADDING = "  ";

type FrameTone = "plain" | "title" | "danger";

interface FrameGlyphs {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

export interface RendererIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export class TerminalRenderer {
  private readonly caps: TerminalCapabilities;
  private readonly theme: Theme;
  private readonly stdout: (text: string) => void;
  private readonly stderr: (text: string) => void;
  private readonly scheduler: Scheduler;
  private readonly fast: boolean;

  constructor(
    options: RendererIO & {
      capabilities: TerminalCapabilities;
      scheduler?: Scheduler;
      fast?: boolean;
    },
  ) {
    this.caps = options.capabilities;
    this.theme = createTheme(options.capabilities);
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.scheduler = options.scheduler ?? createScheduler();
    this.fast = options.fast ?? false;
  }

  write(text: string): void {
    this.stdout(text);
  }

  writeLine(text?: string): void {
    this.stdout((text ?? "") + "\n");
  }

  writeError(text: string): void {
    this.stderr(text + "\n");
  }

  clear(): void {
    if (this.caps.supportsTerminalControl) {
      this.stdout("\u001b[2J\u001b[3J\u001b[H");
    }
  }

  async typewrite(text: string, options?: TypewriterOptions): Promise<void> {
    const typewriter = new Typewriter({ write: this.stdout, scheduler: this.scheduler });
    await typewriter.typewrite(text, this.animationOptions(options));
  }

  async typewriteLine(text = "", options?: TypewriterOptions): Promise<void> {
    const typewriter = new Typewriter({ write: this.stdout, scheduler: this.scheduler });
    await typewriter.typewrite(text, this.animationOptions(options));
    this.stdout("\n");
  }

  renderBootScreen(): void {
    this.writeFrameBorder("top");
    this.writeFrameLine();
    this.writeFrameLine("BHOOT/OS", "title");
    this.writeFrameLine("Haunted Terminal Runtime");
    this.writeFrameLine();
    this.writeFrameLine("Human processes detected: 1");
    this.writeFrameLine("Unknown processes detected: 2", "danger");
    this.writeFrameLine();
  }

  async typewriteFrameLine(text: string, options?: TypewriterOptions): Promise<void> {
    if (options?.signal?.aborted === true) {
      throw new CancellationError();
    }

    const { prefix, suffix } = this.frameLineParts(text);
    this.write(prefix);
    await this.typewrite(text, options);
    this.writeLine(suffix);
  }

  renderBootScreenFooter(): void {
    this.writeFrameLine();
    this.writeFrameBorder("bottom");
  }

  private animationOptions(options?: TypewriterOptions): TypewriterOptions {
    return {
      ...options,
      enabled: (options?.enabled ?? true) && this.shouldAnimate(),
    };
  }

  private shouldAnimate(): boolean {
    return this.caps.isInteractive && !this.caps.reducedMotion && !this.fast;
  }

  private frameGlyphs(): FrameGlyphs {
    if (this.caps.supportsUnicode) {
      return {
        topLeft: "\u2554",
        topRight: "\u2557",
        bottomLeft: "\u255a",
        bottomRight: "\u255d",
        horizontal: "\u2550",
        vertical: "\u2551",
      };
    }

    return {
      topLeft: "+",
      topRight: "+",
      bottomLeft: "+",
      bottomRight: "+",
      horizontal: "=",
      vertical: "|",
    };
  }

  private frameLineParts(text: string): { readonly prefix: string; readonly suffix: string } {
    const textWidth = [...text].length;
    if (textWidth > FRAME_CONTENT_WIDTH) {
      throw new RangeError(`Frame text exceeds ${FRAME_CONTENT_WIDTH} characters`);
    }

    const { vertical } = this.frameGlyphs();
    return {
      prefix: vertical + FRAME_PADDING,
      suffix:
        " ".repeat(FRAME_CONTENT_WIDTH - textWidth) +
        FRAME_PADDING +
        vertical,
    };
  }

  private style(text: string, tone: FrameTone): string {
    if (tone === "title") {
      return this.theme.title(text);
    }
    if (tone === "danger") {
      return this.theme.danger(text);
    }
    return text;
  }

  private writeFrameLine(text = "", tone: FrameTone = "plain"): void {
    const { prefix, suffix } = this.frameLineParts(text);
    this.writeLine(prefix + this.style(text, tone) + suffix);
  }

  private writeFrameBorder(edge: "top" | "bottom"): void {
    const glyphs = this.frameGlyphs();
    const contentWidth = FRAME_CONTENT_WIDTH + FRAME_PADDING.length * 2;
    const left = edge === "top" ? glyphs.topLeft : glyphs.bottomLeft;
    const right = edge === "top" ? glyphs.topRight : glyphs.bottomRight;
    this.writeLine(left + glyphs.horizontal.repeat(contentWidth) + right);
  }
}
