import { ellipse, intersect, polygon, rect, type Shape, subtract, union } from '../raster/shape';

/**
 * Letterforms of the boot wordmark, "ROEL": a wide, high-contrast serif in
 * the spirit of the Neo Geo logo — 7 px stems, 2 px hairlines, bracketed
 * serifs and wedge "beaks" on the arm ends. Coordinates are pixels with the
 * cap line at y = 0 and the baseline at y = CAP_HEIGHT; round letters
 * overshoot by one pixel above and below, as optically corrected type does.
 */
export const CAP_HEIGHT = 32;

const STEM = 7;
const HAIR = 2;
/** Stems sit this far in from the glyph's left edge, leaving room for the left serifs. */
const STEM_X = 3;
const STEM_RIGHT = STEM_X + STEM;

export interface WordmarkGlyph {
  readonly shape: Shape;
  /** Width of the glyph's ink box; letter spacing is added by the wordmark. */
  readonly width: number;
}

/** Triangular fillet between a stem and a serif, so joins read as bracketed rather than glued. */
function bracket(x: number, y: number, run: number, rise: number): Shape {
  return polygon([
    [x, y],
    [x + run, y],
    [x, y + rise],
  ]);
}

/** The stem with its left-hand serif brackets, shared by E, L and R. */
function stem(): Shape {
  return union(
    rect(STEM_X, 0, STEM_RIGHT, CAP_HEIGHT),
    bracket(STEM_X, HAIR, -2, 2),
    bracket(STEM_X, CAP_HEIGHT - HAIR, -2, -2),
    bracket(STEM_RIGHT, CAP_HEIGHT - HAIR, 3, -3),
  );
}

/** A vertical wedge serif hanging from (or standing on) a hairline arm's end. */
function beak(right: number, armY: number, length: number, width: number): Shape {
  const tip = armY + length;
  return polygon([
    [right - width, armY],
    [right, armY],
    [right, tip],
    [right - 1, tip],
  ]);
}

function letterE(width: number): WordmarkGlyph {
  const middle = CAP_HEIGHT / 2 - 1;
  return {
    width,
    shape: union(
      stem(),
      rect(0, 0, width - 2, HAIR),
      bracket(STEM_RIGHT, HAIR, 3, 3),
      beak(width - 2, HAIR, 9, 4),
      rect(STEM_RIGHT, middle, width - 9, middle + HAIR),
      rect(width - 11, middle - 3, width - 9, middle + HAIR + 3),
      bracket(STEM_RIGHT, middle, 2, -2),
      bracket(STEM_RIGHT, middle + HAIR, 2, 2),
      rect(0, CAP_HEIGHT - HAIR, width, CAP_HEIGHT),
      beak(width, CAP_HEIGHT - HAIR, -10, 5),
    ),
  };
}

function letterL(width: number): WordmarkGlyph {
  return {
    width,
    shape: union(
      stem(),
      rect(0, 0, STEM_RIGHT + 4, HAIR),
      bracket(STEM_RIGHT, HAIR, 3, 3),
      rect(0, CAP_HEIGHT - HAIR, width, CAP_HEIGHT),
      beak(width, CAP_HEIGHT - HAIR, -11, 5),
    ),
  };
}

function letterO(width: number): WordmarkGlyph {
  const cx = width / 2;
  const cy = CAP_HEIGHT / 2;
  // Vertical stress: the counter is much narrower than the outline, so the sides carry the weight.
  return {
    width,
    shape: subtract(ellipse(cx, cy, width / 2, cy + 1), ellipse(cx, cy, width / 2 - 8, cy - 1.25)),
  };
}

function letterR(width: number): WordmarkGlyph {
  const bowlBottom = 17;
  const bowlCx = STEM_RIGHT + 10;
  const bowlCy = bowlBottom / 2;
  // The bowl is square where it meets the stem and elliptical on the right.
  const right = (shape: Shape): Shape => intersect(rect(bowlCx, 0, width, bowlBottom), shape);
  const bowl = subtract(
    union(rect(STEM_RIGHT, 0, bowlCx, bowlBottom), right(ellipse(bowlCx, bowlCy, 10, bowlCy))),
    union(rect(STEM_RIGHT, HAIR, bowlCx, bowlBottom - HAIR), right(ellipse(bowlCx, bowlCy, 3.5, bowlCy - HAIR))),
  );
  return {
    width,
    shape: union(
      stem(),
      rect(0, 0, STEM_RIGHT, HAIR),
      rect(0, CAP_HEIGHT - HAIR, STEM_RIGHT + 4, CAP_HEIGHT),
      bowl,
      polygon([
        [bowlCx - 5, bowlBottom - 1],
        [bowlCx + 2, bowlBottom - 1],
        [width - 2, CAP_HEIGHT - HAIR],
        [width - 9, CAP_HEIGHT - HAIR],
      ]),
      rect(width - 10, CAP_HEIGHT - HAIR, width, CAP_HEIGHT),
    ),
  };
}

/** Every letter the wordmark can set, each at its own width. */
export const wordmarkGlyphs: Readonly<Record<string, WordmarkGlyph>> = {
  R: letterR(36),
  E: letterE(31),
  O: letterO(39),
  L: letterL(29),
};
