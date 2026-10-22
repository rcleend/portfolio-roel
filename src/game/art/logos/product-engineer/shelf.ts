import type { Lettering } from './lettering';

/**
 * The room a raised initial leaves above the rest of its line, the way the
 * "M" of METAL SLUG leaves room for "SUPER VEHICLE-001" over "ETAL". It is
 * measured on the rasterised letters, wobble, chips and jitter included,
 * in the line image's pixels, so a name seated by it clears the painted
 * outlines exactly.
 */
export interface Shelf {
  /** The first column clear of the initial's outline in every row from `top` to `bottom`. */
  clearOf(top: number, bottom: number): number;
  /** The highest row the outline of the letters after the initial reaches between columns `left` and `right`. */
  floor(left: number, right: number): number;
  /** The face column of the last letter's top-right corner, on the cap line: where the shelf ends. */
  readonly end: number;
}

/** Jitter and wobble move a letter's top this many rows either way from the cap line. */
const CAP_TOLERANCE = 2;

/** The shelf beside a line's raised initial, or `null` when its first letter is set like the rest. */
export function measureShelf(lettering: Lettering): Shelf | null {
  const { face, initial, origin } = lettering;
  if (!initial) return null;
  const rest = face.subtract(initial.face);
  const outlined = { initial: initial.face.dilate(), rest: rest.dilate() };

  const initialRight = Array.from({ length: face.height }, (_, y) => {
    for (let x = face.width - 1; x >= 0; x--) if (outlined.initial.has(x, y)) return x;
    return -1;
  });
  const restTop = Array.from({ length: face.width }, (_, x) => {
    for (let y = 0; y < face.height; y++) if (outlined.rest.has(x, y)) return y;
    return face.height;
  });
  let end = -1;
  for (let y = origin.y - CAP_TOLERANCE; y <= origin.y + CAP_TOLERANCE; y++) {
    for (let x = face.width - 1; x > end; x--) {
      if (rest.has(x, y)) {
        end = x;
        break;
      }
    }
  }

  return {
    clearOf: (top, bottom) => Math.max(...initialRight.slice(Math.max(0, top), bottom + 1)) + 1,
    floor: (left, right) => Math.min(...restTop.slice(Math.max(0, left), right + 1)),
    end,
  };
}
