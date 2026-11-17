/**
 * What the room's finish does to the page rather than to the room, for the startup still (docs/ROOM.md › Startup):
 * its vignette, read from the finish's own source so the still follows it. (Its bloom is of the page too, and the
 * still has it only as the lamps' halos.)
 */
import { readFileSync } from 'node:fs';
import { ROOM_MOODS } from '../../src/room/atmosphere/moods';
import type { Vignette } from './encode';

/**
 * The wall's level about the set, 0–255: the vignette darkens light, and the still lays black over colours as the
 * page keeps them, so the two agree at one level only (a level either side of it across the wall's range).
 */
const LEVEL = 36;
const STOPS = 10;

const linear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const encoded = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

export function pageVignette(): Vignette {
  const read = (path: string): string => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
  const composite = read('room/atmosphere/RoomAtmosphere.ts');
  const edge = /vec2 edge = \(vUv - 0\.5\) \* vec2\(([\d.]+), 1\.0\);/.exec(composite);
  const fall = /color \*= 1\.0 - smoothstep\(([\d.]+), ([\d.]+), dot\(edge, edge\)\) \* uVignette;/.exec(composite);
  const mood = /mood: '(\w+)'/.exec(read('app/hosts/useRoom.ts'));
  if (!edge || !fall || !mood) throw new Error('The finish’s vignette is not where the still’s build reads it');
  const strength = ROOM_MOODS[mood[1] as keyof typeof ROOM_MOODS].finish?.vignette ?? 0;
  const [from, to] = [Number(fall[1]), Number(fall[2])];
  const stops = Array.from({ length: STOPS }, (_, i) => {
    const distance = ((i / (STOPS - 1)) * Math.sqrt(to)) ** 2;
    const t = Math.max(0, Math.min(1, (distance - from) / (to - from)));
    const kept = 1 - t * t * (3 - 2 * t) * strength;
    return 1 - encoded(linear(LEVEL / 255) * kept) / (LEVEL / 255);
  });
  // vUv runs 0–1 over the page: a half page is the unit here.
  return { stretch: Number(edge[1]), end: to * 4, stops };
}

/** How much of black the vignette lays over a point of a page, 0–1. */
export function vignetteAt(vignette: Vignette, x: number, y: number, width: number, height: number): number {
  const [dx, dy] = [((x / width) * 2 - 1) * vignette.stretch, (y / height) * 2 - 1];
  const place = Math.min(1, Math.hypot(dx, dy) / Math.sqrt(vignette.end)) * (vignette.stops.length - 1);
  const stop = Math.min(vignette.stops.length - 2, Math.floor(place));
  return (
    (vignette.stops[stop] as number) * (1 - (place - stop)) + (vignette.stops[stop + 1] as number) * (place - stop)
  );
}
