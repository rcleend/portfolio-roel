import { clamp } from '../math/scalar';

/** A colour with 8-bit channels; `a` is 0–255 like the other channels. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa`. Throws on anything else so typos surface at startup. */
export function parseHex(hex: string): Rgba {
  if (!HEX_COLOR.test(hex)) throw new Error(`Invalid colour "${hex}": expected #rgb, #rrggbb or #rrggbbaa`);
  const digits = hex.length === 4 ? [...hex.slice(1)].map((d) => d + d).join('') : hex.slice(1);
  const channel = (index: number): number => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), a: digits.length === 8 ? channel(3) : 255 };
}

export function toHex({ r, g, b, a }: Rgba): string {
  const hex = (v: number): string =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a >= 255 ? '' : hex(a)}`;
}

/** Linear blend in sRGB space — good enough for palette ramps, and matches how pixel artists pick in-betweens. */
export function mix(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  });
}

/** Positive `amount` mixes towards white, negative towards black. */
export function shade(color: string, amount: number): string {
  return amount >= 0 ? mix(color, '#ffffff', amount) : mix(color, '#000000', -amount);
}

/**
 * Samples a multi-stop ramp into `count` flat bands. The first and last band
 * are exactly the first and last stop, so authored palette ends survive.
 */
export function bandColors(stops: readonly string[], count: number): string[] {
  if (stops.length === 0) throw new Error('bandColors: at least one colour stop is required');
  if (!Number.isInteger(count) || count < 1) throw new RangeError('bandColors: count must be a positive integer');
  const first = stops[0] as string;
  if (stops.length === 1 || count === 1) return Array.from({ length: count }, () => first);
  return Array.from({ length: count }, (_, i) => {
    const position = (i / (count - 1)) * (stops.length - 1);
    const index = Math.min(Math.floor(position), stops.length - 2);
    return mix(stops[index] as string, stops[index + 1] as string, position - index);
  });
}
