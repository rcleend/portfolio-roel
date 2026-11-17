import sharp from 'sharp';

/**
 * How the startup still is held to the live room (still.spec.ts): two shots of one viewport, compared in outline
 * (where one has an edge the other must have one within a pixel) and in colour (the mean of a small patch).
 */
export interface Shot {
  /** sRGB, three bytes a pixel, one pixel a CSS pixel. */
  readonly rgb: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A PNG as a shot of `width` × `height` CSS pixels. */
export async function shotOf(png: Buffer, width: number, height: number): Promise<Shot> {
  const rgb = await sharp(png).resize({ width, height, fit: 'fill', kernel: 'cubic' }).removeAlpha().raw().toBuffer();
  return { rgb: new Uint8Array(rgb), width, height };
}

/** How steep the picture is at each pixel: the Sobel gradient of its brightness, in levels a pixel. */
export function steepness(shot: Shot): Float32Array {
  const { rgb, width, height } = shot;
  const light = new Float32Array(width * height);
  for (let i = 0; i < light.length; i++)
    light[i] = (rgb[i * 3] as number) * 0.299 + (rgb[i * 3 + 1] as number) * 0.587 + (rgb[i * 3 + 2] as number) * 0.114;
  const steep = new Float32Array(width * height);
  const at = (x: number, y: number): number => light[y * width + x] as number;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const gx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      steep[y * width + x] = Math.hypot(gx, gy) / 4;
    }
  return steep;
}

export interface EdgeMatch {
  /** Pixels of `from` on an edge at least `strong` steep. */
  readonly edges: number;
  /** Those with no edge of `to` at least half as steep within `reach` pixels. */
  readonly stray: number;
}

/**
 * Whether the edges of one shot are in the other: every pixel of `from` on a strong edge wants an edge of `to`
 * within `reach` pixels of it. An outline moved by more than that strays along its whole length. Only pixels in
 * `only` and in none of `ignore` are looked at.
 */
export function matchEdges(
  from: Shot,
  to: Shot,
  strong: number,
  reach: number,
  only: Box,
  ignore: readonly Box[] = [],
): EdgeMatch {
  const [a, b] = [steepness(from), steepness(to)];
  const { width, height } = from;
  let edges = 0;
  let stray = 0;
  const inside = (box: Box, x: number, y: number): boolean =>
    x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      if ((a[y * width + x] as number) < strong || !inside(only, x, y)) continue;
      if (ignore.some((box) => inside(box, x, y))) continue;
      edges++;
      let found = false;
      for (let dy = -reach; dy <= reach && !found; dy++)
        for (let dx = -reach; dx <= reach && !found; dx++) {
          const [ox, oy] = [x + dx, y + dy];
          if (ox >= 0 && oy >= 0 && ox < width && oy < height && (b[oy * width + ox] as number) >= strong / 2)
            found = true;
        }
      if (!found) stray++;
    }
  return { edges, stray };
}

/** The mean colour of the `size` × `size` pixels round a point; null where they are not all in the shot. */
export function patch(shot: Shot, x: number, y: number, size: number): [number, number, number] | null {
  const [left, top] = [Math.round(x - size / 2), Math.round(y - size / 2)];
  if (left < 0 || top < 0 || left + size > shot.width || top + size > shot.height) return null;
  const sum: [number, number, number] = [0, 0, 0];
  for (let py = top; py < top + size; py++)
    for (let px = left; px < left + size; px++)
      for (let channel = 0; channel < 3; channel++)
        sum[channel] = (sum[channel] as number) + (shot.rgb[(py * shot.width + px) * 3 + channel] as number);
  return [sum[0] / size ** 2, sum[1] / size ** 2, sum[2] / size ** 2];
}

/** sRGB bytes to CIE L*a*b* under D65. */
export function labOf(r: number, g: number, b: number): [number, number, number] {
  const linear = (value: number): number => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047);
  const fy = f(0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb);
  const fz = f((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 between two L*a*b* colours (Sharma, Wu and Dalal's formulation; kL = kC = kH = 1). */
export function deltaE00(
  [l1, a1, b1]: readonly [number, number, number],
  [l2, a2, b2]: readonly [number, number, number],
): number {
  const RAD = Math.PI / 180;
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const [ap1, ap2] = [(1 + g) * a1, (1 + g) * a2];
  const [c1, c2] = [Math.hypot(ap1, b1), Math.hypot(ap2, b2)];
  const hue = (b: number, a: number): number => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / RAD + 360) % 360);
  const [h1, h2] = [hue(b1, ap1), hue(b2, ap2)];
  const dL = l2 - l1;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * RAD);
  const L = (l1 + l2) / 2;
  const C = (c1 + c2) / 2;
  let H = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) H /= 2;
    else H = (H + (H < 360 ? 360 : -360)) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((H - 30) * RAD) +
    0.24 * Math.cos(2 * H * RAD) +
    0.32 * Math.cos((3 * H + 6) * RAD) -
    0.2 * Math.cos((4 * H - 63) * RAD);
  const sL = 1 + (0.015 * (L - 50) ** 2) / Math.sqrt(20 + (L - 50) ** 2);
  const sC = 1 + 0.045 * C;
  const sH = 1 + 0.015 * C * T;
  const rT = -2 * Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((H - 275) / 25) ** 2)) * RAD);
  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

export interface ColourMatch {
  /** Blocks across and down, and each block's CIEDE2000 between the two shots' mean colours of it. */
  readonly columns: number;
  readonly rows: number;
  readonly delta: Float32Array;
  readonly max: number;
  readonly p99: number;
  readonly p95: number;
  readonly mean: number;
  /** The worst block's left and top, CSS px. */
  readonly worst: readonly [number, number];
}

/**
 * How far two shots are in colour: CIEDE2000 between the mean colours (means of the sRGB bytes) of each whole block
 * of `block` × `block` CSS px, but for the blocks that touch a box of `ignore`.
 */
export function matchColours(a: Shot, b: Shot, block = 8, ignore: readonly Box[] = []): ColourMatch {
  const [columns, rows] = [Math.floor(a.width / block), Math.floor(a.height / block)];
  const delta = new Float32Array(columns * rows).fill(-1);
  const mean = (shot: Shot, column: number, row: number): [number, number, number] => {
    const sum = [0, 0, 0];
    for (let y = row * block; y < (row + 1) * block; y++)
      for (let x = column * block; x < (column + 1) * block; x++)
        for (let channel = 0; channel < 3; channel++)
          sum[channel] = (sum[channel] as number) + (shot.rgb[(y * shot.width + x) * 3 + channel] as number);
    return sum.map((value) => value / block ** 2) as [number, number, number];
  };
  const values: number[] = [];
  let worst: [number, number] = [0, 0];
  let max = 0;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const [left, top] = [column * block, row * block];
      if (
        ignore.some(
          (box) =>
            left < box.left + box.width &&
            left + block > box.left &&
            top < box.top + box.height &&
            top + block > box.top,
        )
      )
        continue;
      const value = deltaE00(labOf(...mean(a, column, row)), labOf(...mean(b, column, row)));
      delta[row * columns + column] = value;
      values.push(value);
      if (value > max) {
        max = value;
        worst = [left, top];
      }
    }
  values.sort((x, y) => x - y);
  const at = (part: number): number => values[Math.min(values.length - 1, Math.floor(values.length * part))] ?? 0;
  return {
    columns,
    rows,
    delta,
    max,
    p99: at(0.99),
    p95: at(0.95),
    mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    worst,
  };
}
