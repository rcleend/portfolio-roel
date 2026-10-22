import { parseHex, type Rgba } from '@/engine/gfx/color';
import { pixels } from '@/engine/gfx/PixelArt';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { SILHOUETTE } from './colors';
import { stampRows } from './stamp';

/**
 * The product, 9 × 28, standing on its two nozzles: a white launcher lit
 * from the left, a red band under the capsule, a black roll pattern and an
 * escape tower on top.
 */
const ROCKET = pixels(`
  ....k....
  ....k....
  ...kak...
  ...kak...
  ...kwk...
  ..kwlsk..
  ..kwlsk..
  .kwwlsSk.
  .kwwlsSk.
  .krrrrRk.
  .kwwlsSk.
  .kwwlsSk.
  .kddlsSk.
  .kddlsSk.
  .kwwddDk.
  .kwwddDk.
  .kwwlsSk.
  .kwwlsSk.
  .kwwlsSk.
  .kwwlsSk.
  .kwwlsSk.
  .kddlsSk.
  fkddlsSkf
  fkwwddDkf
  fkwwddDkf
  ffkkkkkff
  ..knnnk..
  ..kn.nk..
`);

const KEYS = {
  k: '#140a20',
  a: '#8a84a0',
  w: '#f4f0fa',
  l: '#d4cee4',
  s: '#a69ebe',
  S: '#6e6688',
  r: '#e0403a',
  R: '#8e1e2a',
  d: '#262034',
  D: '#1a1426',
  f: '#3c3452',
  n: '#4a4258',
} as const;

export const ROCKET_SIZE = { width: 9, height: ROCKET.length } as const;

/**
 * The rocket sprite, or its black silhouette: against the white of the
 * ignition bloom it reads as a cut-out, the classic impact frame.
 */
export function paintRocket(silhouette = false): Bitmap {
  const bitmap = new Bitmap(ROCKET_SIZE.width, ROCKET_SIZE.height);
  const keys: Record<string, Rgba> = {};
  for (const [key, hex] of Object.entries(KEYS)) keys[key] = silhouette ? SILHOUETTE.near : parseHex(hex);
  stampRows(bitmap, ROCKET, keys, 0, 0);
  return bitmap;
}
