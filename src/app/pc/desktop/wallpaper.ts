import { Rng } from '@/engine/math/Rng';

/**
 * The desktop wallpaper, "rolling hills": painted procedurally from a fixed
 * seed (no image is downloaded), an original composition of a blue sky with
 * four drifting cumulus clusters over a broad near hill cresting left of
 * centre and a cooler far hill on the right.
 *
 * It is painted once into a cached canvas that serves every texture repaint
 * and is appended, as the very same element, behind the live DOM desktop: one
 * bitmap, so the glass and the live screen match by construction.
 */

export const WALLPAPER_SEED = 2001;
/** Ample for a picture at most ~1100 px wide (soft gradients scale up gracefully). */
const MAX_PIXELS = 1_000_000;
const LOW_MEMORY_MAX_PIXELS = 600_000;
/** Below this growth an upscaled wallpaper is indistinguishable; repainting would only cost time. */
const REPAINT_GROWTH = 1.3;

export interface WallpaperSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The wallpaper's bitmap for a request `requiredWidth` px wide at the
 * picture's aspect (width / height), capped in pixels — harder on devices
 * reporting 2 GB of memory or less.
 */
export function wallpaperSize(requiredWidth: number, aspect: number, deviceMemory: number | undefined): WallpaperSize {
  const maxPixels = deviceMemory !== undefined && deviceMemory <= 2 ? LOW_MEMORY_MAX_PIXELS : MAX_PIXELS;
  const width = Math.max(1, Math.floor(Math.min(requiredWidth, Math.sqrt(maxPixels * aspect))));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/** Whether a wallpaper `currentWidth` px wide must be repainted to serve `wanted`. */
export function needsRepaint(currentWidth: number, wanted: WallpaperSize): boolean {
  return wanted.width > currentWidth * REPAINT_GROWTH;
}

let cached: HTMLCanvasElement | null = null;

/**
 * The shared wallpaper canvas, at least close to `requiredWidth` px wide.
 * Growing repaints the same element in place, so a DOM desktop already
 * showing it picks up the sharper bitmap without a swap. The first call
 * decides whether it is a CPU canvas (`cpu`, see StillRequest.cpuCanvas).
 */
export function wallpaperCanvas(requiredWidth: number, aspect: number, cpu = false): HTMLCanvasElement {
  const wanted = wallpaperSize(requiredWidth, aspect, deviceMemory());
  if (cached && !needsRepaint(cached.width, wanted)) return cached;
  const canvas = cached ?? document.createElement('canvas');
  canvas.width = wanted.width;
  canvas.height = wanted.height;
  const context = canvas.getContext('2d', { willReadFrequently: cpu });
  if (context) paintWallpaper(context, wanted.width, wanted.height);
  cached = canvas;
  return canvas;
}

function deviceMemory(): number | undefined {
  return (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
}

/**
 * A cumulus cluster: its centre (u, v as fractions of the wallpaper's width
 * and height), its half-extent and its typical puff radius (fractions of the
 * width).
 */
type CloudCluster = readonly [u: number, v: number, spreadX: number, spreadY: number, puff: number];

const CLOUDS: readonly CloudCluster[] = [
  [0.24, 0.17, 0.13, 0.03, 0.04],
  [0.6, 0.1, 0.16, 0.028, 0.046],
  [0.87, 0.3, 0.1, 0.026, 0.036],
  [0.44, 0.39, 0.09, 0.018, 0.026],
];
const PUFFS_PER_CLOUD = 26;
/** Puffs are ellipses: cumulus are wider than tall. */
const PUFF_FLATTEN = 0.62;
const GRASS_STROKES = 420;

/** Paints the whole wallpaper into `width` × `height` px of `context`. Deterministic: same size, same calls. */
export function paintWallpaper(context: CanvasRenderingContext2D, width: number, height: number): void {
  const rng = new Rng(WALLPAPER_SEED);
  paintSky(context, width, height);
  for (const cloud of CLOUDS) paintCloud(context, rng, cloud, width, height);
  paintFarHill(context, width, height);
  paintNearHill(context, rng, width, height);
}

function paintSky(context: CanvasRenderingContext2D, width: number, height: number): void {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#1b4fc4');
  sky.addColorStop(0.45, '#3a7fe0');
  sky.addColorStop(0.75, '#b9d8f4');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
}

function paintCloud(
  context: CanvasRenderingContext2D,
  rng: Rng,
  [u, v, spreadX, spreadY, puffRadius]: CloudCluster,
  width: number,
  height: number,
): void {
  // Two unit-radius gradients serve every puff (white body and top, a cool underside); each puff
  // only scales one and sets its alpha.
  const white = puffGradient(context, '255, 255, 255');
  const underside = puffGradient(context, '146, 172, 214');
  for (let index = 0; index < PUFFS_PER_CLOUD; index++) {
    const angle = rng.range(0, Math.PI * 2);
    const reach = Math.sqrt(rng.next());
    const x = (u + Math.cos(angle) * reach * spreadX) * width;
    const y = v * height + Math.sin(angle) * reach * spreadY * width;
    // Puffs in the middle of the cluster are the biggest, so the cloud reads as one billowing mass.
    const radius = puffRadius * width * rng.range(0.55, 1.15) * (1.15 - 0.5 * reach);
    const alpha = rng.range(0.18, 0.4);
    puff(context, underside, x, y + radius * 0.28, radius * 0.95, alpha * 0.3);
    puff(context, white, x, y, radius, alpha);
    puff(context, white, x - radius * 0.08, y - radius * 0.22, radius * 0.62, alpha * 0.7);
  }
  context.globalAlpha = 1;
}

function puffGradient(context: CanvasRenderingContext2D, rgb: string): CanvasGradient {
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(${rgb}, 1)`);
  gradient.addColorStop(0.5, `rgba(${rgb}, 0.62)`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  return gradient;
}

function puff(context: CanvasRenderingContext2D, fill: CanvasGradient, x: number, y: number, r: number, alpha: number) {
  context.save();
  context.translate(x, y);
  context.scale(r, r * PUFF_FLATTEN);
  context.globalAlpha = alpha;
  context.fillStyle = fill;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function farHillPath(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.beginPath();
  context.moveTo(0.36 * width, height);
  context.lineTo(0.36 * width, 0.84 * height);
  context.bezierCurveTo(0.54 * width, 0.67 * height, 0.7 * width, 0.585 * height, 0.84 * width, 0.6 * height);
  context.bezierCurveTo(0.92 * width, 0.607 * height, 0.97 * width, 0.622 * height, width, 0.636 * height);
  context.lineTo(width, height);
  context.closePath();
}

function paintFarHill(context: CanvasRenderingContext2D, width: number, height: number): void {
  farHillPath(context, width, height);
  const fill = context.createLinearGradient(0.74 * width, 0.58 * height, 0.86 * width, 0.92 * height);
  // Aerial perspective: these greens carry a 22 % veil of the horizon's sky blue, which pushes the hill back.
  fill.addColorStop(0, '#b8e2a1');
  fill.addColorStop(0.45, '#89c57a');
  fill.addColorStop(1, '#63a369');
  context.fillStyle = fill;
  context.fill();
}

/** The near hill's crest, from the left edge over the top (left of centre) down to the right edge. */
function nearCrest(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.moveTo(0, 0.7 * height);
  context.bezierCurveTo(0.1 * width, 0.6 * height, 0.21 * width, 0.553 * height, 0.32 * width, 0.556 * height);
  context.bezierCurveTo(0.5 * width, 0.562 * height, 0.7 * width, 0.7 * height, width, 0.865 * height);
}

function paintNearHill(context: CanvasRenderingContext2D, rng: Rng, width: number, height: number): void {
  context.save();
  context.beginPath();
  nearCrest(context, width, height);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  // Lit from the upper left: bright on the crest, deep green in the lower right.
  const fill = context.createLinearGradient(0.2 * width, 0.55 * height, 0.72 * width, 1.05 * height);
  fill.addColorStop(0, '#a6dc4c');
  fill.addColorStop(0.45, '#69b52c');
  fill.addColorStop(1, '#2c7419');
  context.fillStyle = fill;
  context.fill();
  context.clip();
  paintGrass(context, rng, width, height);
  paintCrestLight(context, width, height);
  context.restore();
}

/** Short seeded blades of a lighter and a darker green, longer towards the viewer. */
function paintGrass(context: CanvasRenderingContext2D, rng: Rng, width: number, height: number): void {
  const light: number[] = [];
  const dark: number[] = [];
  for (let index = 0; index < GRASS_STROKES; index++) {
    const depth = rng.next();
    const x = rng.range(0, width);
    const y = (0.55 + 0.45 * depth) * height;
    const length = (0.006 + 0.012 * rng.next()) * height * (0.4 + depth);
    (rng.chance(0.55) ? light : dark).push(x, y, x + rng.range(-0.35, 0.35) * length, y - length);
  }
  context.lineCap = 'round';
  context.lineWidth = Math.max(1, width / 900);
  strokeBlades(context, light, 'rgba(214, 246, 136, 0.16)');
  strokeBlades(context, dark, 'rgba(30, 92, 20, 0.13)');
}

/** One path per tone, so hundreds of blades cost two strokes. `points` holds x1, y1, x2, y2 per blade. */
function strokeBlades(context: CanvasRenderingContext2D, points: readonly number[], color: string): void {
  context.strokeStyle = color;
  context.beginPath();
  for (let point = 0; point < points.length; point += 4) {
    context.moveTo(points[point] as number, points[point + 1] as number);
    context.lineTo(points[point + 2] as number, points[point + 3] as number);
  }
  context.stroke();
}

/** A warm rim of light along the crest; the hill's clip keeps only its inner half. */
function paintCrestLight(context: CanvasRenderingContext2D, width: number, height: number): void {
  const warm = context.createLinearGradient(0, 0, 0.8 * width, 0);
  warm.addColorStop(0.3, 'rgba(255, 238, 160, 0.55)');
  warm.addColorStop(1, 'rgba(255, 238, 160, 0)');
  context.strokeStyle = warm;
  context.globalAlpha = 0.7;
  context.lineWidth = 0.02 * height;
  context.beginPath();
  nearCrest(context, width, height);
  context.stroke();
  context.globalAlpha = 1;
}
