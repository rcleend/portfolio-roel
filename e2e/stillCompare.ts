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
