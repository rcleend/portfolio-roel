import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { TextAlign } from '@/engine/gfx/textLayout';
import { Paragraph } from './Paragraph';

export interface TypewriterOptions {
  readonly maxWidth: number;
  readonly align?: TextAlign;
  /** Frames between characters; the boot screen uses 4. */
  readonly framesPerChar?: number;
  /** Called once per revealed non-space character — hook the typewriter tick here. */
  readonly onChar?: (char: string) => void;
}

/** Reveals a paragraph one character at a time, driven by fixed steps. */
export class TypewriterText {
  readonly paragraph: Paragraph;
  readonly #framesPerChar: number;
  readonly #onChar: ((char: string) => void) | undefined;
  readonly #chars: readonly string[];
  #frames = 0;
  #shown = 0;

  constructor(text: string, style: TextStyle, options: TypewriterOptions) {
    this.paragraph = new Paragraph(text, style, options);
    this.#chars = this.paragraph.block.lines.flatMap((line) => [...line]);
    this.#framesPerChar = Math.max(1, options.framesPerChar ?? 2);
    this.#onChar = options.onChar;
  }

  get done(): boolean {
    return this.#shown >= this.#chars.length;
  }

  get visibleChars(): number {
    return this.#shown;
  }

  /** Advance by one fixed step. */
  update(): void {
    if (this.done) return;
    this.#frames++;
    if (this.#frames % this.#framesPerChar !== 0) return;
    const char = this.#chars[this.#shown] ?? '';
    this.#shown++;
    if (char.trim()) this.#onChar?.(char);
  }

  /** Reveal everything at once (e.g. when the player presses a button). */
  skip(): void {
    this.#shown = this.#chars.length;
  }

  render(gfx: Gfx, x: number, y: number): void {
    this.paragraph.render(gfx, x, y, this.#shown);
  }
}
