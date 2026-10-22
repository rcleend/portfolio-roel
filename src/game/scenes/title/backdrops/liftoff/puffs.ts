import { mix, parseHex, type Rgba, toHex } from '@/engine/gfx/color';
import { bayerThreshold } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';
import { lerp } from '@/engine/math/scalar';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { bandColor } from './bands';
import { SMOKE } from './colors';

/**
 * Smoke is built from round puffs, the way Neo Geo backgrounds build it:
 * each a sprite, banded rather than smoothly shaded. A mass of smoke is
 * drawn in two passes: every puff's halo, one pixel larger, then every
 * puff's body on top. Only the halo's outer ring survives, so backlight
 * catches the edge of the whole mass instead of outlining every puff
 * inside it. Sprites are painted once into an atlas, one row per lighting
 * and palette-cycle phase, so a frame of smoke costs a few dozen copies.
 */

/** The largest puff, in pixels of radius; halos are drawn one larger. */
export const PUFF_MAX_RADIUS = 16;
/** Palette-cycle phases: stepping through them rolls a puff's bands across it, like smoke turning over. */
export const PUFF_PHASES = 6;

type Direction = readonly [x: number, y: number, z: number];

/**
 * How a puff's body is lit, as shares of its ramp: an even `ambient` level
 * plus a `key` light from one direction (screen x right, y down, z towards
 * the viewer). Its halo runs from `haloLow` on the side away from the
 * backlight to `haloHigh` on the side facing it (`haloFrom`, a screen
 * direction).
 */
interface Lighting {
  readonly ramp: readonly Rgba[];
  readonly ambient: number;
  readonly key: Direction;
  readonly keyStrength: number;
  readonly haloFrom: readonly [x: number, y: number];
  readonly haloLow: number;
  readonly haloHigh: number;
}

/** After the launch: lit dimly by the sky from above, with the warm horizon glowing behind the top edges. */
const DUSK: Lighting = {
  ramp: SMOKE.dusk.map(parseHex),
  ambient: 0.24,
  key: [-0.45, -0.65, 0.6],
  keyStrength: 0.3,
  haloFrom: [0.15, -1],
  haloLow: 0.3,
  haloHigh: 1,
};
/** Lit from below by the exhaust: glowing undersides, a fiery rim along the bottom. */
const EMBER: Lighting = {
  ramp: SMOKE.ember.map(parseHex),
  ambient: 0.16,
  key: [0, 0.8, 0.6],
  keyStrength: 0.82,
  haloFrom: [0, 1],
  haloLow: 0.25,
  haloHigh: 1,
};

/**
 * Every lighting, by index: the settled smoke, two steps of exhaust glow on
 * it and full ember light, then the plume's shadowed and sunlit halves.
 */
export const PUFF_LIGHTING = { DUSK: 0, EMBER: 3, SHADOW: 4, SUNLIT: 5 } as const;
const LIGHTINGS: readonly Lighting[] = [
  warmed(0),
  warmed(1 / 3),
  warmed(2 / 3),
  warmed(1),
  {
    ramp: SMOKE.shadow.map(parseHex),
    ambient: 0.22,
    key: [-0.2, -0.9, 0.4],
    keyStrength: 0.3,
    haloFrom: [0, -1],
    haloLow: 0.45,
    haloHigh: 0.95,
  },
  {
    ramp: SMOKE.sunlit.map(parseHex),
    ambient: 0.3,
    key: [0.6, 0.5, 0.6],
    keyStrength: 0.6,
    haloFrom: [0.6, 0.8],
    haloLow: 0.1,
    haloHigh: 0.55,
  },
];

/** Bodies first, then halos, each block one row per lighting and phase. */
const ROWS_PER_KIND = LIGHTINGS.length * PUFF_PHASES;

/** The dusk lighting, `warmth` of the way to full ember light: every parameter blended, the ramps colour by colour. */
function warmed(warmth: number): Lighting {
  const blend = (from: number, to: number): number => lerp(from, to, warmth);
  return {
    ramp: DUSK.ramp.map((color, i) => parseHex(mix(toHex(color), toHex(EMBER.ramp[i] ?? color), warmth))),
    ambient: blend(DUSK.ambient, EMBER.ambient),
    key: [blend(DUSK.key[0], EMBER.key[0]), blend(DUSK.key[1], EMBER.key[1]), blend(DUSK.key[2], EMBER.key[2])],
    keyStrength: blend(DUSK.keyStrength, EMBER.keyStrength),
    haloFrom: [blend(DUSK.haloFrom[0], EMBER.haloFrom[0]), blend(DUSK.haloFrom[1], EMBER.haloFrom[1])],
    haloLow: blend(DUSK.haloLow, EMBER.haloLow),
    haloHigh: blend(DUSK.haloHigh, EMBER.haloHigh),
  };
}

/** Exhaust warmth 0–3 (see `exhaustWarmth`) to a lighting. */
export function warmthLighting(warmth: number): number {
  return Math.min(PUFF_LIGHTING.EMBER, Math.max(PUFF_LIGHTING.DUSK, Math.round(warmth)));
}

/** How far the rolling bands push a pixel lighter or darker, as a share of the ramp. */
const ROLL = 0.06;

/** Sprite of radius `r` starts at this x in its atlas row: radii 1, 2, 3… sit side by side. */
function spriteLeft(radius: number): number {
  return radius * radius - 1;
}

const ROW_HEIGHT = PUFF_MAX_RADIUS * 2 + 1;
const ATLAS_WIDTH = spriteLeft(PUFF_MAX_RADIUS + 1);

/** Bodies, then halos: one atlas row per lighting and phase, each sprite centred on its row's middle line. */
export function paintPuffAtlas(): Bitmap {
  const atlas = new Bitmap(ATLAS_WIDTH, 2 * ROWS_PER_KIND * ROW_HEIGHT);
  LIGHTINGS.forEach((lit, l) => {
    for (let phase = 0; phase < PUFF_PHASES; phase++) {
      const row = l * PUFF_PHASES + phase;
      for (let radius = 1; radius <= PUFF_MAX_RADIUS; radius++) {
        const cx = spriteLeft(radius) + radius;
        paintBody(atlas, lit, radius, phase, cx, row * ROW_HEIGHT + PUFF_MAX_RADIUS);
        paintHalo(atlas, lit, radius, phase, cx, (ROWS_PER_KIND + row) * ROW_HEIGHT + PUFF_MAX_RADIUS);
      }
    }
  });
  return atlas;
}

function paintBody(atlas: Bitmap, lit: Lighting, radius: number, phase: number, cx: number, cy: number): void {
  const [kx, ky, kz] = normalize(lit.key);
  const last = lit.ramp.length - 1;
  forEachPixel(radius, (dx, dy, d2) => {
    const nx = dx / radius;
    const ny = dy / radius;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const facing = nx * kx + ny * ky + nz * kz;
    // The edge away from the key light is dithered, so the halo below shows through it as a soft rim.
    if (radius > 2 && d2 > (radius - 0.8) ** 2 && facing < 0.2 && bayerThreshold('bayer4', dx, dy) >= 0.5) return;
    const roll = ROLL * Math.sin(2 * Math.PI * ((dx * 0.4 + dy) / (radius * 1.7) + phase / PUFF_PHASES));
    const share = lit.ambient + lit.keyStrength * Math.max(0, facing) + roll;
    atlas.set(cx + dx, cy + dy, bandColor(lit.ramp, share * last, dx + radius, dy + radius));
  });
}

function paintHalo(atlas: Bitmap, lit: Lighting, radius: number, phase: number, cx: number, cy: number): void {
  const [hx, hy] = lit.haloFrom;
  const length = Math.hypot(hx, hy);
  const last = lit.ramp.length - 1;
  forEachPixel(radius, (dx, dy) => {
    // 1 facing the backlight, 0 side-on, -1 away from it.
    const toward = (dx * hx + dy * hy) / (Math.hypot(dx, dy) * length || 1);
    const roll = ROLL * Math.sin(2 * Math.PI * (dx / (radius * 2) + phase / PUFF_PHASES));
    const share = lerp(lit.haloLow, lit.haloHigh, Math.max(0, toward) ** 0.8) + roll;
    atlas.set(cx + dx, cy + dy, bandColor(lit.ramp, share * last, dx + radius, dy + radius));
  });
}

/** Every pixel of a disc of `radius`; r² + r draws rounder pixel circles than r², which leaves flat-sided octagons. */
function forEachPixel(radius: number, paint: (dx: number, dy: number, d2: number) => void): void {
  const reach = radius * radius + radius * 0.8;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= reach) paint(dx, dy, d2);
    }
  }
}

function normalize([x, y, z]: Direction): [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** Draws one puff's body centred on (x, y) from the atlas; a radius below 1 draws nothing. */
export function drawPuff(
  gfx: Gfx,
  atlas: HTMLCanvasElement,
  lighting: number,
  phase: number,
  radius: number,
  x: number,
  y: number,
): void {
  drawSprite(gfx, atlas, 0, lighting, phase, radius, x, y);
}

/** Draws one puff's halo, a pixel larger than its body, to go underneath the bodies of its mass. */
export function drawHalo(
  gfx: Gfx,
  atlas: HTMLCanvasElement,
  lighting: number,
  phase: number,
  radius: number,
  x: number,
  y: number,
): void {
  drawSprite(gfx, atlas, ROWS_PER_KIND, lighting, phase, radius + 1, x, y);
}

function drawSprite(
  gfx: Gfx,
  atlas: HTMLCanvasElement,
  firstRow: number,
  lighting: number,
  phase: number,
  radius: number,
  x: number,
  y: number,
): void {
  const r = Math.min(PUFF_MAX_RADIUS, Math.round(radius));
  if (r < 1) return;
  const size = r * 2 + 1;
  const row = firstRow + lighting * PUFF_PHASES + (((phase % PUFF_PHASES) + PUFF_PHASES) % PUFF_PHASES);
  const top = row * ROW_HEIGHT + PUFF_MAX_RADIUS - r;
  gfx.image(atlas, Math.round(x) - r, Math.round(y) - r, { source: { x: spriteLeft(r), y: top, w: size, h: size } });
}
