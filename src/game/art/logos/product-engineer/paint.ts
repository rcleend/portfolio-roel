import { parseHex } from '@/engine/gfx/color';
import { Rng } from '@/engine/math/Rng';
import { Bitmap } from '../raster/Bitmap';
import type { Mask } from '../raster/Mask';
import { hash2, valueNoise } from '../raster/noise';
import { rampAt } from '../raster/ramp';
import { EXTRUSION_DEPTH, type Lettering, SLANT } from './lettering';

/**
 * The title logo's paint job, after Metal Slug's: a banded yellow → orange →
 * red-orange face with a rough rust-and-stone texture and chiselled cracks,
 * a lit top edge, a deep dark-red extrusion towards the bottom left and a
 * near-black outline around everything.
 */
const FACE = ['#ffe466', '#ffc93a', '#ffaa2a', '#ff8e1e', '#f87218', '#e65814', '#cc4010', '#ac2e0c'].map(parseHex);
const HIGHLIGHT = parseHex('#fffbd2');
const CRACK = parseHex('#86200a');
const CRACK_LIGHT = parseHex('#ffe48c');
/** Extrusion shades from just behind the face to its far edge. */
const EXTRUSION = ['#8a2408', '#6c1a06', '#561404', '#460f04', '#3a0c03', '#300a03'].map(parseHex);
const OUTLINE = parseHex('#1c0703');

/** Cracks per letter on average; the seeded draw gives some letters three and some none. */
const CRACKS_PER_LETTER = 1.8;

export function paintLettering(lettering: Lettering, seed: number): Bitmap {
  const { face } = lettering;
  const bitmap = new Bitmap(face.width, face.height);
  const layers = extrusionLayers(face);
  const silhouette = layers.reduce((all, layer) => all.union(layer), face);
  bitmap.fill(silhouette.outline(), OUTLINE);
  // Deepest layer first, so pixels nearer the face win.
  for (let depth = layers.length - 1; depth >= 0; depth--) {
    bitmap.fill(layers[depth] as Mask, rampAt(EXTRUSION, depth));
  }
  bitmap.fill(face, (x, y) => rampAt(FACE, faceShade(face, lettering, x, y, seed)));
  bitmap.fill(face, (x, y) => (isTopEdge(face, x, y) ? HIGHLIGHT : null));
  carveCracks(bitmap, lettering, seed);
  return bitmap;
}

/** Copies of the face stepped down-left one pixel at a time, minus everything in front of them. */
function extrusionLayers(face: Mask): Mask[] {
  const layers: Mask[] = [];
  let covered = face;
  for (let depth = 1; depth <= EXTRUSION_DEPTH; depth++) {
    const layer = face.union(face, -depth, depth).subtract(covered);
    layers.push(layer);
    covered = covered.union(layer);
  }
  return layers;
}

/**
 * Fractional index into the face ramp. The ramp runs top to bottom of the line; fine
 * noise frays the band edges into grain, stretched diagonal noise lays rust
 * streaks across it, and edges are lit from the top left.
 */
function faceShade(face: Mask, lettering: Lettering, x: number, y: number, seed: number): number {
  const { origin, height } = lettering;
  const along = (y - origin.y) / height;
  let shade = along * (FACE.length - 1);
  shade += (valueNoise(x, y, 2, 2, seed + 3) - 0.5) * 1.0;
  // Streaks follow the slant, like rust running down a weathered plate.
  const streak = valueNoise(x + y * SLANT * 3, y, 12, 3, seed + 4);
  if (streak > 0.66) shade += 1;
  if (streak > 0.8) shade += 1;
  const speckle = hash2(x, y, seed + 5);
  if (speckle < 0.05) shade += 1;
  else if (speckle > 0.985) shade -= 1;
  if (!face.has(x - 1, y)) shade -= 2;
  if (!face.has(x + 1, y)) shade += 1;
  if (!face.has(x, y + 1)) shade += 2;
  return shade;
}

function isTopEdge(face: Mask, x: number, y: number): boolean {
  return !face.has(x, y - 1);
}

/** Short jagged cracks running down-left, each with a lit lip on its right so it reads as cut in. */
function carveCracks(bitmap: Bitmap, lettering: Lettering, seed: number): void {
  const { face, letters } = lettering;
  const rng = new Rng(seed + 6);
  const isInterior = (x: number, y: number): boolean =>
    face.has(x, y) && face.has(x - 1, y) && face.has(x + 1, y) && face.has(x, y - 1) && face.has(x, y + 1);
  const total = Math.round(letters.length * CRACKS_PER_LETTER);
  for (let i = 0; i < total; i++) {
    const box = rng.pick(letters);
    // Slanted letters: a point at height y is shifted right by its distance above the baseline.
    let y = box.y + rng.int(2, Math.floor(box.h * 0.6));
    let x = Math.round(box.x + rng.int(4, box.w - 4) + (box.y + box.h - y) * SLANT);
    const length = rng.int(6, 14);
    for (let step = 0; step < length; step++) {
      if (!isInterior(x, y)) break;
      bitmap.set(x, y, CRACK);
      if (isInterior(x + 1, y)) bitmap.set(x + 1, y, CRACK_LIGHT);
      y += 1;
      x -= rng.chance(0.6) ? 1 : 0;
    }
  }
}
