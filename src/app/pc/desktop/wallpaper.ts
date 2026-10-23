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
 * showing it picks up the sharper bitmap without a swap.
 */
export function wallpaperCanvas(requiredWidth: number, aspect: number): HTMLCanvasElement {
  const wanted = wallpaperSize(requiredWidth, aspect, deviceMemory());
  if (cached && !needsRepaint(cached.width, wanted)) return cached;
  const canvas = cached ?? document.createElement('canvas');
  canvas.width = wanted.width;
  canvas.height = wanted.height;
  const context = canvas.getContext('2d');
  if (context) paintWallpaper(context, wanted.width, wanted.height);
  cached = canvas;
  return canvas;
}

function deviceMemory(): number | undefined {
  return (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
}

interface CloudCluster {
  /** Centre, as fractions of the wallpaper's width and height. */
  readonly u: number;
  readonly v: number;
  /** Half-extent of the cluster, as fractions of the width. */
  readonly spreadX: number;
  readonly spreadY: number;
  /** Typical puff radius, as a fraction of the width. */
  readonly puff: number;
}

const CLOUDS: readonly CloudCluster[] = [
  { u: 0.24, v: 0.17, spreadX: 0.13, spreadY: 0.03, puff: 0.04 },
  { u: 0.6, v: 0.1, spreadX: 0.16, spreadY: 0.028, puff: 0.046 },
  { u: 0.87, v: 0.3, spreadX: 0.1, spreadY: 0.026, puff: 0.036 },
  { u: 0.44, v: 0.39, spreadX: 0.09, spreadY: 0.018, puff: 0.026 },
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
  cloud: CloudCluster,
  width: number,
  height: number,
): void {
  // Three unit-radius gradients serve every puff; each puff only scales them and sets its alpha.
  const body = puffGradient(context, '255, 255, 255');
  const top = puffGradient(context, '255, 255, 255');
  const underside = puffGradient(context, '146, 172, 214');
  for (let index = 0; index < PUFFS_PER_CLOUD; index++) {
    const angle = rng.range(0, Math.PI * 2);
    const reach = Math.sqrt(rng.next());
    const x = (cloud.u + Math.cos(angle) * reach * cloud.spreadX) * width;
    const y = cloud.v * height + Math.sin(angle) * reach * cloud.spreadY * width;
    // Puffs in the middle of the cluster are the biggest, so the cloud reads as one billowing mass.
    const radius = cloud.puff * width * rng.range(0.55, 1.15) * (1.15 - 0.5 * reach);
    const alpha = rng.range(0.18, 0.4);
    puff(context, underside, x, y + radius * 0.28, radius * 0.95, alpha * 0.3);
    puff(context, body, x, y, radius, alpha);
    puff(context, top, x - radius * 0.08, y - radius * 0.22, radius * 0.62, alpha * 0.7);
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
  fill.addColorStop(0, '#b8e58a');
  fill.addColorStop(0.45, '#7cbf58');
  fill.addColorStop(1, '#4b9442');
  context.fillStyle = fill;
  context.fill();
  // Aerial perspective: a veil of the horizon's sky colour pushes the far hill back.
  context.fillStyle = 'rgba(185, 216, 244, 0.22)';
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

/** Short seeded blades, bigger and bolder towards the viewer, batched into one path per tone and depth band. */
function paintGrass(context: CanvasRenderingContext2D, rng: Rng, width: number, height: number): void {
  const bands = 3;
  const unit = Math.max(1, width / 900);
  const tones = ['rgba(214, 246, 136, 0.16)', 'rgba(30, 92, 20, 0.13)'];
  const paths = Array.from({ length: bands * tones.length }, () => [] as number[]);
  for (let index = 0; index < GRASS_STROKES; index++) {
    const depth = rng.next();
    const x = rng.range(0, width);
    const y = (0.55 + 0.45 * depth) * height;
    const length = (0.006 + 0.012 * rng.next()) * height * (0.4 + depth);
    const lean = rng.range(-0.35, 0.35) * length;
    const tone = rng.chance(0.55) ? 0 : 1;
    const band = Math.min(bands - 1, Math.floor(depth * bands));
    paths[band * tones.length + tone]?.push(x, y, x + lean, y - length);
  }
  context.lineCap = 'round';
  paths.forEach((points, index) => {
    const band = Math.floor(index / tones.length);
    context.strokeStyle = tones[index % tones.length] as string;
    context.lineWidth = unit * (0.6 + 0.5 * band);
    context.beginPath();
    for (let point = 0; point < points.length; point += 4) {
      context.moveTo(points[point] as number, points[point + 1] as number);
      context.lineTo(points[point + 2] as number, points[point + 3] as number);
    }
    context.stroke();
  });
}

/** A warm rim of light along the crest; the hill's clip keeps only its inner half. */
function paintCrestLight(context: CanvasRenderingContext2D, width: number, height: number): void {
  const warm = context.createLinearGradient(0, 0, width, 0);
  warm.addColorStop(0, 'rgba(255, 236, 150, 0.2)');
  warm.addColorStop(0.3, 'rgba(255, 238, 160, 0.55)');
  warm.addColorStop(0.8, 'rgba(255, 238, 160, 0)');
  context.strokeStyle = warm;
  for (const [lineWidth, alpha] of [
    [0.05, 0.16],
    [0.016, 0.7],
  ] as const) {
    context.globalAlpha = alpha;
    context.lineWidth = lineWidth * height;
    context.beginPath();
    nearCrest(context, width, height);
    context.stroke();
  }
  context.globalAlpha = 1;
}
