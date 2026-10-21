import { TRANSPARENT_KEY } from '@/engine/gfx/PixelArt';

/**
 * Builds sprite frames from reusable parts (head, torso, arms, legs), so a
 * character's eight animations share one set of hand-drawn pieces and stay
 * on-model. The result is plain `string[]` rows — the PixelArt contract.
 */
export type Rows = readonly string[];

export interface StampOptions {
  readonly flipX?: boolean;
  /** Palette-key substitutions applied to this part only, e.g. `{ c: 'C' }` to shade a sleeve. */
  readonly recolor?: Readonly<Record<string, string>>;
  /** Draw only where the frame is still transparent — for parts that sit behind the body. */
  readonly behind?: boolean;
}

export class FrameBuilder {
  readonly width: number;
  readonly height: number;
  readonly #cells: string[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.#cells = Array.from({ length: height }, () => Array.from({ length: width }, () => TRANSPARENT_KEY));
  }

  /** Copies the opaque pixels of `part` with its top-left at (x, y); pixels outside the frame are clipped. */
  stamp(part: Rows, x: number, y: number, options: StampOptions = {}): this {
    part.forEach((row, dy) => {
      const chars = [...row];
      chars.forEach((char, i) => {
        if (char === TRANSPARENT_KEY) return;
        const dx = options.flipX ? chars.length - 1 - i : i;
        const cell = this.#cells[y + dy];
        const column = x + dx;
        if (!cell || column < 0 || column >= this.width) return;
        if (options.behind && cell[column] !== TRANSPARENT_KEY) return;
        cell[column] = options.recolor?.[char] ?? char;
      });
    });
    return this;
  }

  rows(): string[] {
    return this.#cells.map((cells) => cells.join(''));
  }
}

/** Mirrors rows horizontally. */
export function flipRows(rows: Rows): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

/** Replaces palette keys, e.g. to derive the calm "happy" customer from the angry one. */
export function recolorRows(rows: Rows, map: Readonly<Record<string, string>>): string[] {
  return rows.map((row) => [...row].map((char) => map[char] ?? char).join(''));
}

/** Shifts rows by whole pixels inside the same frame size, padding with transparency. */
export function shiftRows(rows: Rows, dx: number, dy: number): string[] {
  const width = [...(rows[0] ?? '')].length;
  const frame = new FrameBuilder(width, rows.length);
  frame.stamp(rows, dx, dy);
  return frame.rows();
}

/** Copy of `rows` with some rows replaced by index — for expression variants of a head. */
export function withRows(rows: Rows, replacements: Readonly<Record<number, string>>): string[] {
  return rows.map((row, index) => replacements[index] ?? row);
}
