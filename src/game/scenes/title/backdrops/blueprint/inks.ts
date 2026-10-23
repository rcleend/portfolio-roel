import { parseHex } from '@/engine/gfx/color';

/**
 * The whole blueprint in one ramp, darkest first: cyanotype paper from the
 * deepest unexposed navy through Prussian and cobalt to the blueprint blue
 * the light table lifts behind the logo, then the line inks up to the
 * white-hot pen tip. Everything is drawn as an index into it, so the light
 * table switching on, ink cooling and lines being erased are all palette
 * steps rather than alpha fades.
 */
export const RAMP = [
  '#050f28',
  '#0a1f4a',
  '#0d2a5e',
  '#113572',
  '#143f84',
  '#1a4994',
  '#1f53a0',
  '#255dab',
  '#2c67b6',
  '#3572c0',
  '#407eca',
  '#4c8ad2',
  '#6199dc',
  '#7fb2e8',
  '#b0d4f4',
  '#d8eeff',
  '#ffffff',
] as const;

export const RAMP_RGBA = RAMP.map(parseHex);

/** Named line inks, as ramp indices. */
export const INK = {
  /** A line on its last step before the paper takes it back. */
  ghost: 11,
  /** Construction and dimension lines, and the plotter's settled ink. */
  mid: 13,
  pale: 14,
  /** Borders, lettering and the lines that matter. */
  white: 15,
  /** The plot point and the pen tip. */
  hot: 16,
} as const;

/** The colour of ramp step `index`, clamped to the ramp. */
export function shadeOf(index: number): string {
  return RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(index)))] as string;
}
