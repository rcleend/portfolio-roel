import { polygon, rect, roundedRect, type Shape, subtract, union } from '../raster/shape';

/**
 * Upright skeletons of the title logo's letters: Metal Slug-heavy, 44 px
 * tall, with 12 px stems, 10 px bars and small squeezed counters. They are
 * deliberately plain — slant, wobble, chipped edges, extrusion and paint are
 * applied by the logo builder, so every letter gets the same treatment.
 */
export const LETTER_HEIGHT = 44;

const STEM = 12;
const BAR = 10;
const H = LETTER_HEIGHT;
/** Bottom of the top bowl of P and R. */
const BOWL = 28;

export interface LogoLetter {
  readonly shape: Shape;
  readonly width: number;
}

function letterP(): LogoLetter {
  const width = 35;
  return {
    width,
    shape: union(
      rect(0, 0, STEM, H),
      subtract(
        polygon([
          [0, 0],
          [width - 8, 0],
          [width, 8],
          [width, BOWL - 8],
          [width - 8, BOWL],
          [0, BOWL],
        ]),
        polygon([
          [STEM, BAR],
          [width - 12, BAR],
          [width - 10, BAR + 2],
          [width - 10, BOWL - BAR - 2],
          [width - 12, BOWL - BAR],
          [STEM, BOWL - BAR],
        ]),
      ),
    ),
  };
}

function letterR(): LogoLetter {
  const p = letterP();
  const width = 37;
  return {
    width,
    shape: union(
      p.shape,
      polygon([
        [STEM + 4, BOWL - 3],
        [STEM + 15, BOWL - 3],
        [width, H],
        [width - 13, H],
      ]),
    ),
  };
}

function letterO(): LogoLetter {
  const width = 38;
  return {
    width,
    shape: subtract(
      roundedRect(0, 0, width, H, [13, 13, 13, 13]),
      roundedRect(STEM, BAR, width - STEM, H - BAR, [4, 4, 4, 4]),
    ),
  };
}

function letterD(): LogoLetter {
  const width = 37;
  return {
    width,
    shape: subtract(
      roundedRect(0, 0, width, H, [0, 15, 15, 0]),
      roundedRect(STEM, BAR, width - STEM, H - BAR, [0, 5, 5, 0]),
    ),
  };
}

function letterU(): LogoLetter {
  const width = 37;
  return {
    width,
    shape: subtract(
      roundedRect(0, 0, width, H, [0, 0, 15, 15]),
      roundedRect(STEM, -1, width - STEM, H - BAR, [0, 0, 5, 5]),
    ),
  };
}

/** C and G share their open bowl; the opening is a wedge so the terminals end in hard, chiselled cuts. */
function openBowl(width: number): Shape {
  return subtract(
    roundedRect(0, 0, width, H, [14, 9, 9, 14]),
    roundedRect(STEM, BAR, width + 1, H - BAR, [5, 0, 0, 5]),
    polygon([
      [width - 9, BAR],
      [width + 1, BAR - 4],
      [width + 1, H - BAR + 4],
      [width - 9, H - BAR],
    ]),
  );
}

function letterC(): LogoLetter {
  const width = 35;
  return { width, shape: openBowl(width) };
}

function letterG(): LogoLetter {
  const width = 38;
  return {
    width,
    shape: union(
      openBowl(width),
      rect(width - 18, H / 2 - 3, width, H / 2 + 6),
      roundedRect(width - STEM, H / 2 - 3, width, H, [0, 0, 9, 0]),
    ),
  };
}

function letterT(): LogoLetter {
  const width = 36;
  const left = (width - STEM) / 2;
  return {
    width,
    shape: union(
      // The bar's ends dip a little, like brush strokes pressed down at the start and end.
      polygon([
        [0, 0],
        [width, 0],
        [width, BAR + 3],
        [width - 4, BAR],
        [4, BAR],
        [0, BAR + 3],
      ]),
      rect(left, 0, left + STEM, H),
    ),
  };
}

function letterE(): LogoLetter {
  const width = 32;
  const middle = H / 2 - 5;
  return {
    width,
    shape: union(
      rect(0, 0, STEM, H),
      polygon([
        [0, 0],
        [width, 0],
        [width, BAR + 3],
        [width - 4, BAR],
        [0, BAR],
      ]),
      rect(0, middle, width - 6, middle + BAR - 1),
      polygon([
        [0, H - BAR],
        [width - 4, H - BAR],
        [width, H - BAR - 3],
        [width, H],
        [0, H],
      ]),
    ),
  };
}

function letterN(): LogoLetter {
  const width = 38;
  return {
    width,
    shape: union(
      rect(0, 0, STEM, H),
      rect(width - STEM, 0, width, H),
      polygon([
        [0, 0],
        [STEM + 1, 0],
        [width, H],
        [width - STEM - 1, H],
      ]),
    ),
  };
}

function letterI(): LogoLetter {
  return { width: 13, shape: rect(0, 0, 13, H) };
}

/** Every letter the title logo can set. */
export const logoLetters: Readonly<Record<string, LogoLetter>> = {
  C: letterC(),
  D: letterD(),
  E: letterE(),
  G: letterG(),
  I: letterI(),
  N: letterN(),
  O: letterO(),
  P: letterP(),
  R: letterR(),
  T: letterT(),
  U: letterU(),
};
