import { hash2, hash32 } from '../../gen/kit/hash';

/*
 * What the poster designs are drawn with: the 2D canvas, the site's three faces and the room's integer hashes (the same
 * stars, grain and ridgelines on every device). A design draws in millimetres of its own sheet, origin at the top-left;
 * at the atlas's 4 to 8 texels per centimetre a millimetre is about half a texel, so designs are built from bold
 * shapes, and small print is there to read as small print.
 */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A canvas on the main thread or in the painter's worker. */
export type Sheet = HTMLCanvasElement | OffscreenCanvas;
/** A poster: paints a sheet `w` × `h` millimetres. */
export type Design = (c: Ctx, w: number, h: number) => void;

const FACES = {
  /** Nunito: the workhorse, 800 for headlines and 600 for the rest. */
  n: 'Nunito, "Avenir Next", system-ui, sans-serif',
  /** Chewy: brush lettering, handwriting. */
  c: 'Chewy, "Marker Felt", "Comic Sans MS", cursive',
  /** Silkscreen: pixels. */
  s: 'Silkscreen, "Courier New", monospace',
} as const;

/** A canvas of a size, wherever this runs. */
export function sheetOf(width: number, height: number): Sheet {
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export interface TypeOptions {
  /** The face (FACES); Nunito by default. */
  readonly f?: keyof typeof FACES;
  /** Nunito's weight: 800 by default. */
  readonly wt?: 600 | 800;
  /** Alignment: centred by default. */
  readonly a?: CanvasTextAlign;
  /** Tracking in ems. */
  readonly t?: number;
  /** Squeezes the line into this width. */
  readonly max?: number;
  /** An outline of this colour, a fraction of the size wide. */
  readonly o?: string;
  readonly ow?: number;
}

/** Sets a line of type with its baseline at `y`. */
export function type(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  options: TypeOptions = {},
): void {
  const face = options.f ?? 'n';
  c.font = `${face === 'n' ? (options.wt ?? 800) : 400} ${size}px ${FACES[face]}`;
  c.textAlign = options.a ?? 'center';
  c.textBaseline = 'alphabetic';
  c.letterSpacing = `${(options.t ?? 0) * size}px`;
  // Tracking trails the last letter: a centred or right-set line is moved back by half or all of it.
  const shift = ((options.t ?? 0) * size * (c.textAlign === 'center' ? 1 : c.textAlign === 'right' ? 2 : 0)) / 2;
  if (options.o) {
    c.lineJoin = 'round';
    c.lineWidth = size * (options.ow ?? 0.16);
    c.strokeStyle = options.o;
    c.strokeText(text, x + shift, y, options.max);
  }
  c.fillStyle = color;
  c.fillText(text, x + shift, y, options.max);
  c.letterSpacing = '0px';
}

export function rect(
  c: Ctx,
  color: string | CanvasGradient | CanvasPattern,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

export function disc(c: Ctx, color: string | CanvasGradient, x: number, y: number, r: number): void {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, 2 * Math.PI);
  c.fill();
}

/** A filled polygon from a flat list of x, y. */
export function poly(c: Ctx, color: string | CanvasGradient, points: readonly number[]): void {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < points.length; i += 2) c.lineTo(points[i] as number, points[i + 1] as number);
  c.fill();
}

/** A stroked open path from a flat list of x, y. */
export function line(
  c: Ctx,
  color: string | CanvasGradient,
  width: number,
  points: readonly number[],
  dash?: readonly number[],
): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.setLineDash(dash ? [...dash] : []);
  c.beginPath();
  for (let i = 0; i < points.length; i += 2) c.lineTo(points[i] as number, points[i + 1] as number);
  c.stroke();
  c.setLineDash([]);
}

export function ring(c: Ctx, color: string | CanvasGradient, width: number, x: number, y: number, r: number): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.arc(x, y, r, 0, 2 * Math.PI);
  c.stroke();
}

/** A linear gradient between two points from `[offset, colour]` stops. */
export function ramp(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = c.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

/** A radial gradient around a point. */
export function glow(
  c: Ctx,
  x: number,
  y: number,
  r: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

/** 0 ≤ value < 1, the `n`-th of a seeded series. */
export function rnd(seed: number, n: number): number {
  return hash32(Math.imul(seed, 0x9e3779b1) + n) / 4294967296;
}

/** Smooth value noise along a line, 0…1. */
export function noise1(seed: number, x: number): number {
  const cell = Math.floor(x);
  const f = x - cell;
  const t = f * f * (3 - 2 * f);
  return hash2(cell, seed) * (1 - t) + hash2(cell + 1, seed) * t;
}

/** A starfield: `count` stars over w × h, most of them faint, in one path. */
export function stars(c: Ctx, seed: number, count: number, w: number, h: number, color: string, size = 1): void {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < count; i++) {
    const r = size * (0.5 + 1.6 * rnd(seed, i * 3 + 2) ** 4);
    const x = rnd(seed, i * 3) * w;
    const y = rnd(seed, i * 3 + 1) * h;
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, 2 * Math.PI);
  }
  c.fill();
}

/**
 * A ridgeline silhouette from x0 to x1: its crest wanders around `y` by `amp`, with features `scale` wide, and it is
 * filled down to `floor`.
 */
export function ridge(
  c: Ctx,
  color: string | CanvasGradient,
  seed: number,
  x0: number,
  x1: number,
  y: number,
  amp: number,
  scale: number,
  floor: number,
): void {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x0, floor);
  const step = Math.max(1, scale / 6);
  for (let x = x0; x <= x1 + step; x += step) {
    const n =
      noise1(seed, x / scale) * 0.65 +
      noise1(seed + 7, (x / scale) * 2.7) * 0.25 +
      noise1(seed + 13, (x / scale) * 7) * 0.1;
    c.lineTo(x, y - (n - 0.5) * 2 * amp);
  }
  c.lineTo(x1, floor);
  c.fill();
}

/**
 * Halftone: dots on a grid turned by `angle`, each as large as `tone(x, y)` (0…1) says, all in one path. `pitch` is
 * the grid's spacing; a dot at full tone touches its neighbours.
 */
export function halftone(
  c: Ctx,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
  pitch: number,
  tone: (x: number, y: number) => number,
  angle = Math.PI / 4,
): void {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const [cx, cy] = [x + w / 2, y + h / 2];
  const reach = Math.ceil(Math.hypot(w, h) / 2 / pitch);
  c.fillStyle = color;
  c.beginPath();
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      const px = cx + (i * cos - j * sin) * pitch;
      const py = cy + (i * sin + j * cos) * pitch;
      if (px < x || px > x + w || py < y || py > y + h) continue;
      const r = Math.sqrt(Math.min(1, Math.max(0, tone(px, py)))) * pitch * 0.72;
      if (r < pitch * 0.08) continue;
      c.moveTo(px + r, py);
      c.arc(px, py, r, 0, 2 * Math.PI);
    }
  }
  c.fill();
}

/** A sunburst: `count` wedges around a point from r0 to r1, every other one filled. */
export function burst(
  c: Ctx,
  color: string,
  x: number,
  y: number,
  r0: number,
  r1: number,
  count: number,
  turn = 0,
): void {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < count; i++) {
    const a0 = turn + (i * 2 * Math.PI) / count;
    const a1 = a0 + Math.PI / count;
    c.moveTo(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0);
    c.lineTo(x + Math.cos(a0) * r1, y + Math.sin(a0) * r1);
    c.lineTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1);
    c.lineTo(x + Math.cos(a1) * r0, y + Math.sin(a1) * r0);
  }
  c.fill();
}

/**
 * Pixel art from rows of characters: each character is a key of `palette` (a space, or any key it lacks, is clear),
 * each pixel `size` across.
 */
export function pixels(
  c: Ctx,
  x: number,
  y: number,
  size: number,
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; ) {
      const key = row[i] as string;
      let run = 1;
      while (row[i + run] === key) run++;
      const color = palette[key];
      // A hair wider than the grid, so no seam shows between runs at a fractional scale.
      if (color) rect(c, color, x + i * size, y + j * size, run * size + 0.05, size + 0.05);
      i += run;
    }
  });
}

/** Small print as a column of grey bars: what a block of credits or dates reads as from across a room. */
export function greek(
  c: Ctx,
  color: string,
  seed: number,
  x: number,
  y: number,
  w: number,
  rows: number,
  pitch: number,
  centred = false,
): void {
  c.fillStyle = color;
  for (let row = 0; row < rows; row++) {
    const length = w * (0.55 + 0.45 * rnd(seed, row));
    let at = centred ? x + (w - length) / 2 : x;
    const end = at + length;
    for (let word = 0; at < end; word++) {
      const run = Math.min(end - at, pitch * (1.2 + 3.5 * rnd(seed, row * 31 + word)));
      c.fillRect(at, y + row * pitch, run, pitch * 0.42);
      at += run + pitch * 0.6;
    }
  }
}

/** Runs `draw` clipped to a rectangle, with the origin at its corner. */
export function within(c: Ctx, x: number, y: number, w: number, h: number, draw: () => void): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(x, y);
  draw();
  c.restore();
}

/** Runs `draw` turned by `angle` (radians) about a point, which becomes the origin. */
export function turned(c: Ctx, x: number, y: number, angle: number, draw: () => void): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  draw();
  c.restore();
}

/** A tile of paper grain: grey around the middle, for an overlay. */
export function grainTile(size: number, seed: number, spread: number): Sheet {
  const tile = sheetOf(size, size);
  const context = tile.getContext('2d') as Ctx;
  const image = context.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Two hashes summed: a soft bell, so the grain has few harsh specks.
    const n = (hash2(i % size, Math.floor(i / size) + seed) + hash2(i % size, Math.floor(i / size) + seed + 977)) / 2;
    const value = 128 + (n - 0.5) * 2 * spread;
    image.data.set([value, value, value, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  return tile;
}
