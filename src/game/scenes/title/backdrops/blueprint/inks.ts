import { parseHex } from '@/engine/gfx/color';
import type { WindowTheme } from '../../../../ui/theme';

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

/**
 * A key or slot lit on the blueprint: the character select card's white
 * border and mid-blue bevel over a field sinking to the unexposed paper. The
 * character select lights its focused skill with it, the mission select its
 * CONTACT key. The field stays this deep so gold lettering keeps over 5:1
 * even when a focused button brightens it.
 */
export const LIT_WINDOW: WindowTheme = {
  outline: shadeOf(0),
  light: shadeOf(INK.white),
  mid: shadeOf(INK.mid),
  dark: shadeOf(4),
  fill: { stops: [shadeOf(2), shadeOf(1), shadeOf(0)], bands: 3, dither: 'bayer2' },
};
