import { parseHex } from '@/engine/gfx/color';
import { Rng } from '@/engine/math/Rng';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { Mask } from '../../../../art/logos/raster/Mask';
import { hash2, valueNoise } from '../../../../art/logos/raster/noise';
import { rampAt } from '../../../../art/logos/raster/ramp';
import { circle, displace, polygon, type Shape, union, type Vertex } from '../../../../art/logos/raster/shape';

/**
 * The impact crater behind the title logo, after Metal Slug's: a glowing
 * molten core inside a grey metallic splash crown with spiky splashes,
 * flung droplets and two long diagonal streaks. A few frames differ only in
 * spike length and core glow; cycling them gives the subtle wobble.
 */
export const CRATER_SIZE = { width: 150, height: 250 } as const;
/** Centre of the core inside each frame. */
export const CRATER_CENTER = { x: 75, y: 125 } as const;
export const CRATER_FRAMES = 4;

const CORE_RADIUS = 25;
const CROWN_RADIUS = 35;
const SPIKES = 20;
/** Splashes are molten metal, not machined: their edges wobble by this much. */
const LUMPINESS = 2.6;
/** Direction of the long streak, up and to the right like the reference. */
const STREAK_ANGLE = (-62 * Math.PI) / 180;
const SEED = 0xc2a7;

const MOLTEN = ['#fffbd0', '#ffe676', '#ffc23e', '#ff9a26', '#f4701c', '#d84a14', '#a82c0c', '#6c180a'].map(parseHex);
const SCORCH = parseHex('#2a1206');
/** Metal from shadow to highlight. */
const METAL = ['#4a463c', '#76705f', '#9f9886', '#c6c0ac', '#e6e1cf', '#fbf8ec'].map(parseHex);
const METAL_OUTLINE = parseHex('#2c2822');

interface Spike {
  readonly angle: number;
  readonly length: number;
  readonly width: number;
  readonly phase: number;
}

/** The fixed splash layout; frames vary only through each spike's phase. */
function splashLayout(): { spikes: Spike[]; droplets: Vertex[] } {
  const rng = new Rng(SEED);
  const spikes = Array.from({ length: SPIKES }, (_, i) => ({
    angle: ((i + rng.range(-0.3, 0.3)) / SPIKES) * Math.PI * 2,
    length: rng.range(5, 19),
    width: rng.range(3.5, 6),
    phase: rng.range(0, Math.PI * 2),
  }));
  const droplets = Array.from({ length: 7 }, (): Vertex => {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(46, 60);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  return { spikes, droplets };
}

const SPLASH = splashLayout();

/** A tapered splash from `inner` to `outer` along `angle`, `width` wide at its root. */
function spike(angle: number, inner: number, outer: number, width: number): Shape {
  const { x: cx, y: cy } = CRATER_CENTER;
  const along: Vertex = [Math.cos(angle), Math.sin(angle)];
  const across: Vertex = [-along[1], along[0]];
  const at = (r: number, w: number): Vertex => [cx + along[0] * r + across[0] * w, cy + along[1] * r + across[1] * w];
  return polygon([
    at(inner, -width),
    at(outer * 0.7, -width * 0.6),
    at(outer, 0),
    at(outer * 0.7, width * 0.6),
    at(inner, width),
  ]);
}

/** The crown (everything metallic) for wobble frame `frame`. */
export function crownMask(frame: number): Mask {
  const { x: cx, y: cy } = CRATER_CENTER;
  const wobble = (frame / CRATER_FRAMES) * Math.PI * 2;
  const shapes: Shape[] = [circle(cx, cy, CROWN_RADIUS)];
  for (const s of SPLASH.spikes) {
    const length = s.length + Math.sin(wobble + s.phase) * 1.5;
    shapes.push(spike(s.angle, CROWN_RADIUS - 4, CROWN_RADIUS + length, s.width));
  }
  for (const [dx, dy] of SPLASH.droplets) shapes.push(circle(cx + dx, cy + dy, 3));
  shapes.push(spike(STREAK_ANGLE, CROWN_RADIUS - 6, 120, 6.5), spike(STREAK_ANGLE + Math.PI, CROWN_RADIUS - 6, 112, 6));
  shapes.push(
    spike(STREAK_ANGLE + 0.12, CROWN_RADIUS, 80, 3),
    spike(STREAK_ANGLE + Math.PI - 0.1, CROWN_RADIUS, 74, 3),
  );
  const lumpy = displace(union(...shapes), (x, y) => [
    (valueNoise(x, y, 4, 4, SEED + 2) - 0.5) * LUMPINESS,
    (valueNoise(x, y, 4, 4, SEED + 3) - 0.5) * LUMPINESS,
  ]);
  return Mask.fromShape(CRATER_SIZE.width, CRATER_SIZE.height, lumpy).subtract(coreMask());
}

export function coreMask(): Mask {
  return Mask.fromShape(CRATER_SIZE.width, CRATER_SIZE.height, circle(CRATER_CENTER.x, CRATER_CENTER.y, CORE_RADIUS));
}

/** Paints wobble frame `frame` (0 ≤ frame < CRATER_FRAMES). */
export function paintCrater(frame: number): Bitmap {
  const bitmap = new Bitmap(CRATER_SIZE.width, CRATER_SIZE.height);
  const crown = crownMask(frame);
  const core = coreMask();
  bitmap.fill(crown.union(core).outline(), METAL_OUTLINE);
  paintMetal(bitmap, crown);
  paintCore(bitmap, core, frame);
  return bitmap;
}

/**
 * Lights the crown from the top left. Each pixel's surface direction comes
 * from the gradient of its depth inside the shape, so every splash gets a
 * lit and a shaded flank, like embossed metal.
 */
function paintMetal(bitmap: Bitmap, crown: Mask): void {
  const limit = 4;
  const depths = crown.depths(limit);
  const depthAt = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= crown.width || y >= crown.height ? 0 : (depths[y * crown.width + x] ?? 0);
  bitmap.fill(crown, (x, y) => {
    // Depth rises inwards, so its gradient points into the metal; towards the light is up and left.
    const gx = depthAt(x + 1, y) - depthAt(x - 1, y);
    const gy = depthAt(x, y + 1) - depthAt(x, y - 1);
    const facing = (gx + gy) * 0.5;
    const ridge = depthAt(x, y) >= limit - 1 ? 1 : 0;
    // The lip around the core falls into shadow, which sinks the core below the crown.
    const lip = Math.hypot(x + 0.5 - CRATER_CENTER.x, y + 0.5 - CRATER_CENTER.y) < CORE_RADIUS + 4 ? -1.3 : 0;
    const grain = (hash2(x, y, SEED) - 0.5) * 1.1;
    return rampAt(METAL, 1.6 + facing * 2.6 + ridge + lip + grain);
  });
}

/** A molten disc lit from slightly above-left of its centre, with a scorched rim. */
function paintCore(bitmap: Bitmap, core: Mask, frame: number): void {
  const pulse = 1 + Math.sin((frame / CRATER_FRAMES) * Math.PI * 2) * 0.06;
  const hot = { x: CRATER_CENTER.x - 3, y: CRATER_CENTER.y - 3 };
  bitmap.fill(core, (x, y) => {
    const fromEdge = CORE_RADIUS - Math.hypot(x + 0.5 - CRATER_CENTER.x, y + 0.5 - CRATER_CENTER.y);
    if (fromEdge < 2) return SCORCH;
    const glow = Math.hypot(x + 0.5 - hot.x, y + 0.5 - hot.y) / (CORE_RADIUS * pulse);
    return rampAt(MOLTEN, glow * (MOLTEN.length - 0.5) + (hash2(x, y, SEED + 1) - 0.5) * 0.8);
  });
}
