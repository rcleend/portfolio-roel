import { Rng } from '@/engine/math/Rng';
import { Mask, type PixelBox } from '../raster/Mask';
import { valueNoise } from '../raster/noise';
import { displace, polygon, rotate, type Shape, scale, shear, translate, union, type Vertex } from '../raster/shape';
import { LETTER_HEIGHT, logoLetters } from './letters';

/** Pixels the letters lean right per pixel of height. */
export const SLANT = 0.2;
/** How far the extrusion reaches down and to the left. */
export const EXTRUSION_DEPTH = 6;

const LETTER_SPACING = 2;
/**
 * Room around the upright letter boxes for what grows out of them: jitter
 * and edge wobble (a few pixels either way), the extrusion (left and below)
 * and the 1 px outline.
 */
const SPILL = 4;
const MARGIN = {
  left: EXTRUSION_DEPTH + SPILL,
  top: SPILL,
  right: SPILL,
  bottom: EXTRUSION_DEPTH + SPILL,
} as const;
/** Each letter is nudged and tilted a little, so the word looks cut by hand rather than typeset. */
const JITTER = { rise: 1, tilt: 0.035 } as const;
/** Edge wobble: amplitude in pixels and the size of the noise cells that drive it. */
const ROUGHNESS = { amplitude: 1.6, cell: 5 } as const;
/** Small triangular bites out of the edges, like chipped stone: on average this many per letter. */
const CHIPS_PER_LETTER = 0.9;

export interface LetteringOptions {
  /** Cap height in pixels; the 44 px skeletons scale to it. */
  readonly height: number;
  /** Seeds the per-letter jitter and edge wobble, so the logo is identical on every visit. */
  readonly seed: number;
}

/** One line of the logo as a 1-bit face, plus where everything sits in it. */
export interface Lettering {
  readonly face: Mask;
  /** Letter boxes (upright, before the slant) in mask pixels, for per-letter detailing. */
  readonly letters: readonly PixelBox[];
  /** Top-left of the first letter's upright box, in mask pixels. */
  readonly origin: { readonly x: number; readonly y: number };
  readonly height: number;
}

/** Sets `text` in the logo's letters: scaled, jittered, slanted and roughened, then rasterised. */
export function setLettering(text: string, options: LetteringOptions): Lettering {
  const { height, seed } = options;
  const rng = new Rng(seed);
  const factor = height / LETTER_HEIGHT;
  const origin = { x: MARGIN.left, y: MARGIN.top };
  const placed: Shape[] = [];
  const boxes: PixelBox[] = [];
  let pen = origin.x;
  for (const char of text) {
    const glyph = logoLetters[char];
    if (!glyph) throw new Error(`Title logo: no letter for "${char}"`);
    const width = glyph.width * factor;
    const rise = rng.int(-JITTER.rise, JITTER.rise);
    const tilt = rng.range(-JITTER.tilt, JITTER.tilt);
    const upright = translate(scale(glyph.shape, factor, factor), pen, origin.y + rise);
    placed.push(rotate(upright, tilt, [pen + width / 2, origin.y + height / 2]));
    boxes.push({ x: Math.round(pen), y: origin.y + rise, w: Math.round(width), h: height });
    pen += width + LETTER_SPACING;
  }
  const baseline = origin.y + height;
  const slanted = shear(union(...placed), SLANT, baseline);
  const rough = displace(slanted, (x, y) => [
    (valueNoise(x, y, ROUGHNESS.cell, ROUGHNESS.cell, seed + 1) - 0.5) * ROUGHNESS.amplitude,
    (valueNoise(x, y, ROUGHNESS.cell, ROUGHNESS.cell, seed + 2) - 0.5) * ROUGHNESS.amplitude,
  ]);
  const width = Math.ceil(pen - LETTER_SPACING + height * SLANT + MARGIN.right);
  const face = Mask.fromShape(width, Math.ceil(baseline + MARGIN.bottom), rough);
  return { face: chipEdges(face, boxes, baseline, rng), letters: boxes, origin, height };
}

type Edge = 'left' | 'right' | 'top';
const EDGES: readonly Edge[] = ['left', 'right', 'top', 'top'];

/**
 * Bites small triangles out of letter edges. Each chip finds a real edge by
 * walking in from outside the letter, so it always lands on the outline and
 * never punches a hole through a stroke.
 */
function chipEdges(face: Mask, letters: readonly PixelBox[], baseline: number, rng: Rng): Mask {
  let chipped = face;
  const count = Math.round(letters.length * CHIPS_PER_LETTER);
  for (let i = 0; i < count; i++) {
    const notch = chipAt(face, rng.pick(letters), baseline, rng.pick(EDGES), rng);
    if (notch) chipped = chipped.subtract(Mask.fromShape(face.width, face.height, polygon(notch)));
  }
  return chipped;
}

function chipAt(face: Mask, box: PixelBox, baseline: number, edge: Edge, rng: Rng): Vertex[] | null {
  const depth = rng.range(2.5, 4.5);
  const half = rng.range(1.5, 3);
  if (edge === 'top') {
    const x = rng.int(box.x + 3, box.x + box.w - 4) + Math.round(box.h * SLANT);
    let y = box.y - 3;
    while (y < box.y + 6 && !face.has(x, y)) y++;
    if (!face.has(x, y)) return null;
    return [
      [x + 0.5 - half - 1, y - 1],
      [x + 0.5 + half + 1, y - 1],
      [x + 0.5 + rng.range(-1, 1), y + depth],
    ];
  }
  const y = rng.int(box.y + 4, box.y + box.h - 5);
  const lean = Math.round((baseline - y) * SLANT);
  const step = edge === 'left' ? 1 : -1;
  let x = edge === 'left' ? box.x + lean - 1 : box.x + box.w + lean;
  for (let walked = 0; walked < 6 && !face.has(x, y); walked++) x += step;
  if (!face.has(x, y)) return null;
  const outside = edge === 'left' ? x - 1 : x + 2;
  return [
    [outside, y + 0.5 - half - 1],
    [outside, y + 0.5 + half + 1],
    [x + 0.5 + step * depth, y + 0.5 + rng.range(-1, 1)],
  ];
}
