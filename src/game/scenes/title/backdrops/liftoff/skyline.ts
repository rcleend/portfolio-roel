import type { Rgba } from '@/engine/gfx/color';
import { Rng } from '@/engine/math/Rng';
import type { Vec2 } from '@/engine/math/Vec2';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { valueNoise } from '../../../../art/logos/raster/noise';
import { ellipse, polygon, rect, type Shape, union } from '../../../../art/logos/raster/shape';
import { SILHOUETTE } from './colors';
import { FERNSEHTURM, GOLDEN_GATE_TOWER } from './landmarks';
import { STAGE } from './layout';
import { type Keys, stampRows } from './stamp';

/** The skyline art's first row on screen: the Fernsehturm's needle tip, just under the logo. */
export const SKYLINE_TOP = 138;

const FERNSEHTURM_AT = { x: 42, y: SKYLINE_TOP } as const;
const GOLDEN_GATE_AT = { x: 258, y: 148 } as const;
/** The Golden Gate's roadway, and where its side span's cable comes down to it, clear of the prompt. */
const ROADWAY = { y: 189, from: 214, anchorage: 228 } as const;
const CRANE = { mast: 20, top: 152, jibLeft: 6, jibRight: 47, hook: 44 } as const;
const SEED = 0xb3e1;

/** Aviation lights, in screen pixels: blinking red on the needle, the bridge legs and the crane. */
export const BEACONS: readonly Vec2[] = [
  { x: FERNSEHTURM_AT.x + 5, y: FERNSEHTURM_AT.y },
  { x: GOLDEN_GATE_AT.x + 1, y: GOLDEN_GATE_AT.y },
  { x: GOLDEN_GATE_AT.x + 9, y: GOLDEN_GATE_AT.y },
  { x: CRANE.mast, y: CRANE.top - 1 },
];

/** One layer of silhouette, flat with a 1 px lit edge on the sunset side. */
interface Layer {
  readonly fill: Rgba;
  readonly rim: Rgba;
}

const FAR: Layer = { fill: SILHOUETTE.far, rim: SILHOUETTE.farRim };
const CITY: Layer = { fill: SILHOUETTE.city, rim: SILHOUETTE.cityRim };
const NEAR: Layer = { fill: SILHOUETTE.near, rim: SILHOUETTE.nearRim };
const BRIDGE: Layer = { fill: SILHOUETTE.bridge, rim: SILHOUETTE.bridgeRim };

/**
 * The horizon both missions share (docs/ART-DIRECTION.md › Title ›
 * Liftoff): Berlin on the left, with its rooftops, the Dom, a crane and the
 * Fernsehturm; San Francisco on the right, with the Marin hills, the
 * Golden Gate and a hint of the Transamerica Pyramid. Three depths of
 * silhouette, palest furthest away, so the dusk haze sits between them.
 * Covers `SKYLINE_TOP` down to the horizon; clear everywhere else.
 */
export function paintSkyline(): Bitmap {
  const bitmap = new Bitmap(STAGE.width, STAGE.horizon - SKYLINE_TOP);
  const rng = new Rng(SEED);
  fill(bitmap, FAR, union(farHills(), transamerica(), farTowers()));
  paintBerlinRoofs(bitmap, rng);
  fill(bitmap, CITY, berlinerDom());
  paintSanFranciscoBlocks(bitmap, rng);
  paintCrane(bitmap);
  stamp(
    bitmap,
    FERNSEHTURM,
    { k: NEAR.fill, r: NEAR.rim, w: SILHOUETTE.window, o: SILHOUETTE.windowDim },
    FERNSEHTURM_AT,
  );
  paintGoldenGate(bitmap);
  return bitmap;
}

/** Low far hills along the whole horizon, rising into the Marin headlands behind the bridge. */
function farHills(): Shape {
  return (x, y) => {
    const marin = 22 * Math.exp(-(((x - 246) / 30) ** 2));
    const roll = valueNoise(x, 0, 23, 1, SEED + 1) * 5;
    return y >= STAGE.horizon - 3 - roll - marin;
  };
}

/** The pyramid's slender taper, its two shoulder "wings" and the spire. */
function transamerica(): Shape {
  const base = STAGE.horizon;
  return union(
    polygon([
      [301, 160],
      [307, base],
      [295, base],
    ]),
    rect(300.5, 150, 301.5, 160),
    rect(297, 168, 305, 171),
  );
}

/** Two downtown towers far behind the waterfront blocks. */
function farTowers(): Shape {
  return union(rect(282, 176, 292, STAGE.horizon), rect(309, 171, 320, STAGE.horizon));
}

/** The Berliner Dom: a ribbed dome on its drum, a lantern, and corner towers with their own small domes. */
function berlinerDom(): Shape {
  const cx = 85;
  const top = 176;
  return union(
    rect(cx - 0.5, top - 6, cx + 0.5, top),
    rect(cx - 1.5, top - 4, cx + 1.5, top - 3),
    ellipse(cx, top + 5, 6.5, 5.5),
    rect(cx - 6, top + 5, cx + 6, top + 9),
    rect(cx - 11, top + 9, cx + 11, STAGE.horizon),
    rect(cx - 11, top + 4, cx - 7, top + 9),
    rect(cx + 7, top + 4, cx + 11, top + 9),
    ellipse(cx - 9, top + 4, 2, 2),
    ellipse(cx + 9, top + 4, 2, 2),
  );
}

/** Altbau blocks with gabled, mansard and flat roofs, chimneys and a few lit windows, kept below the prompt. */
function paintBerlinRoofs(bitmap: Bitmap, rng: Rng): void {
  for (let left = -4; left < 132; ) {
    const width = rng.int(7, 14);
    const right = left + width;
    const top = STAGE.horizon - rng.int(9, 15);
    const roof = ROOFS[rng.int(0, ROOFS.length - 1)] ?? 'flat';
    const chimney = left + rng.int(2, width - 3);
    const chimneyTop = top - (roof === 'flat' ? 3 : 5);
    const block = union(rect(left, top, right, STAGE.horizon), roofOf(roof, left, right, top));
    fill(bitmap, CITY, union(block, rect(chimney, chimneyTop, chimney + 1, top)), left - 1, right + 1);
    paintWindows(bitmap, rng, left + 2, right - 1, top + 3);
    left = right + rng.int(0, 1);
  }
}

const ROOFS = ['flat', 'gable', 'mansard'] as const;

/** A roof on the block spanning `left` to `right` whose walls top out at `top`. */
function roofOf(roof: (typeof ROOFS)[number], left: number, right: number, top: number): Shape {
  switch (roof) {
    case 'gable':
      return polygon([
        [left, top + 0.5],
        [(left + right) / 2, top - 4],
        [right, top + 0.5],
      ]);
    case 'mansard':
      return polygon([
        [left, top + 0.5],
        [left + 2, top - 3],
        [right - 2, top - 3],
        [right, top + 0.5],
      ]);
    case 'flat':
      // A cornice, a pixel proud of the facade.
      return rect(left - 1, top - 1, right + 1, top);
  }
}

/** Mid-rise San Francisco blocks in front of the far towers, flat-topped, one with a mast. */
function paintSanFranciscoBlocks(bitmap: Bitmap, rng: Rng): void {
  const blocks: readonly (readonly [left: number, right: number, top: number])[] = [
    [274, 283, 186],
    [286, 294, 181],
    [294, 299, 188],
    [305, 313, 183],
    [313, 320, 187],
  ];
  for (const [left, right, top] of blocks) {
    fill(bitmap, CITY, rect(left, top, right, STAGE.horizon));
    paintWindows(bitmap, rng, left + 1, right - 1, top + 2);
  }
  fill(bitmap, CITY, rect(289, 175, 290, 181));
}

/** A sparse grid of lit windows: most of the city has gone home. */
function paintWindows(bitmap: Bitmap, rng: Rng, left: number, right: number, top: number): void {
  for (let y = top; y < STAGE.horizon - 1; y += 3) {
    for (let x = left; x < right; x += 3) {
      const lit = rng.next();
      if (lit < 0.1) set(bitmap, x, y, SILHOUETTE.window);
      else if (lit < 0.18) set(bitmap, x, y, SILHOUETTE.windowDim);
    }
  }
}

/** A tower crane: Berlin is always building something. */
function paintCrane(bitmap: Bitmap): void {
  const { mast, top, jibLeft, jibRight, hook } = CRANE;
  // A two-pixel lattice mast: solid on the left, every other pixel on the right.
  for (let y = top; y < STAGE.horizon; y++) {
    set(bitmap, mast, y, NEAR.fill);
    if (y % 2 === 0) set(bitmap, mast + 1, y, NEAR.fill);
  }
  for (let x = jibLeft; x <= jibRight; x++) set(bitmap, x, top + 2, NEAR.fill);
  for (let x = jibLeft; x < mast; x++) set(bitmap, x, top + 3, NEAR.fill);
  line(bitmap, mast, top - 1, jibRight, top + 2, NEAR.fill);
  line(bitmap, mast, top - 1, jibLeft, top + 2, NEAR.fill);
  for (let y = top + 3; y < top + 16; y++) set(bitmap, hook, y, NEAR.fill);
  set(bitmap, hook + 1, top + 16, NEAR.fill);
  set(bitmap, hook - 1, top + 16, NEAR.fill);
}

/** The tower, the roadway with its approach, the main cables and their suspenders. */
function paintGoldenGate(bitmap: Bitmap): void {
  const { x, y } = GOLDEN_GATE_AT;
  const saddle = { left: x + 1, right: x + 9, y: y + 2 };
  // The side span drops to its anchorage; the main span sags towards its middle, off-screen to the right.
  hangCable(bitmap, ROADWAY.anchorage, saddle.left, (cx) => {
    const along = (saddle.left - cx) / (saddle.left - ROADWAY.anchorage);
    return saddle.y + (ROADWAY.y - 1 - saddle.y) * along ** 1.6;
  });
  hangCable(bitmap, saddle.right + 1, STAGE.width, (cx) => saddle.y + 34 * (1 - (1 - (cx - saddle.right) / 110) ** 2));
  fill(bitmap, BRIDGE, union(rect(ROADWAY.from, ROADWAY.y, STAGE.width, ROADWAY.y + 2), pier(222), pier(238)));
  stamp(bitmap, GOLDEN_GATE_TOWER, { g: BRIDGE.fill, G: BRIDGE.rim }, GOLDEN_GATE_AT);
}

/** A main cable from column `from` to `to` (exclusive) along `height`, with a suspender down to the roadway every third column. */
function hangCable(bitmap: Bitmap, from: number, to: number, height: (x: number) => number): void {
  for (let cx = from; cx < to; cx++) {
    const cy = Math.round(height(cx));
    set(bitmap, cx, cy, BRIDGE.fill);
    if (cx % 3 === 0) for (let sy = cy + 1; sy < ROADWAY.y; sy++) set(bitmap, cx, sy, SILHOUETTE.suspender);
  }
}

function pier(x: number): Shape {
  return rect(x, ROADWAY.y + 2, x + 2, STAGE.horizon);
}

/** Fills `shape` between columns `left` and `right` (exclusive), rim-lit on its right edges. */
function fill(bitmap: Bitmap, layer: Layer, shape: Shape, left = 0, right: number = bitmap.width): void {
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = Math.max(0, left); x < Math.min(bitmap.width, right); x++) {
      if (!inside(shape, x, y)) continue;
      bitmap.set(x, y, inside(shape, x + 1, y) ? layer.fill : layer.rim);
    }
  }
}

/** Shapes are in screen pixels; the bitmap starts at `SKYLINE_TOP`. */
function inside(shape: Shape, x: number, y: number): boolean {
  return shape(x + 0.5, y + SKYLINE_TOP + 0.5);
}

function set(bitmap: Bitmap, x: number, y: number, color: Rgba): void {
  bitmap.set(x, y - SKYLINE_TOP, color);
}

function stamp(bitmap: Bitmap, rows: readonly string[], keys: Keys, at: Vec2): void {
  stampRows(bitmap, rows, { b: SILHOUETTE.beaconOff, ...keys }, at.x, at.y - SKYLINE_TOP);
}

/** A 1 px line, both ends inclusive, in screen pixels. */
function line(bitmap: Bitmap, x0: number, y0: number, x1: number, y1: number, color: Rgba): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    set(bitmap, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), color);
  }
}
