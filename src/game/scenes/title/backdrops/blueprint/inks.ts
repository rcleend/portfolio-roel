import { parseHex } from '@/engine/gfx/color';

/**
 * The whole blueprint in one ramp, darkest first, every step a colour the
 * menus already use, so the title flows into character select and mission
 * select: black for the pen carriage's shadow; the paper, which is
 * character select's navy field, one step per band; the pinstripe and
 * survey-grid navies the grid prints in; the light table's glow behind the
 * logo, in the character card's spotlight and pedestal indigos; then the
 * line inks, up the lavenders of the menu frames to the white-hot pen tip.
 * Everything is drawn as an index into it, so the light table switching
 * on, ink cooling and lines being erased are all palette steps rather than
 * alpha fades.
 */
export const RAMP = [
  // Black: the shadow under the pen carriage.
  '#000000',
  // Character select's field, its five bands from the bottom of the screen up.
  '#07061a',
  '#0a0821',
  '#0c0a28',
  '#0f0c2f',
  '#110e36',
  // Character select's pinstripes and mission select's survey grid.
  '#151243',
  '#1d1b4e',
  // The character card's spotlight, the indigo window's dark rim and the pedestal's lit top.
  '#251d6b',
  '#2f2682',
  '#3d2f8f',
  '#4b3da6',
  // The character card frame's rims and a near star, the prompt's lavender and the indigo window's light rim.
  '#6a5ad0',
  '#8476d6',
  '#9d90e6',
  '#c4b8f5',
  '#e4dcff',
  '#ffffff',
] as const;

export const RAMP_RGBA = RAMP.map(parseHex);

/** Where the paper sits in the ramp: character select's field bands, darkest first. */
export const PAPER_STEPS = { first: 1, count: 5 } as const;

/** The light table's plateau behind the logo: the indigo window's dark violet. */
export const GLOW_STEP = 10;

/** The faintest the grid prints, whatever the paper under it: fine lines in the pinstripe navy, heavy ones in the survey grid's. */
export const GRID_FLOOR = { minor: 6, major: 7 } as const;

/** Named line inks, as ramp indices. */
export const INK = {
  /** The shadow under the pen carriage. */
  shadow: 0,
  /** A line on its last step before the paper takes it back. */
  ghost: 12,
  /** Construction and dimension lines, and the plotter's settled ink. */
  mid: 14,
  pale: 15,
  /** Borders, lettering and the lines that matter. */
  white: 16,
  /** The plot point and the pen tip. */
  hot: 17,
} as const;

/** The colour of ramp step `index`, clamped to the ramp. */
export function shadeOf(index: number): string {
  return RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(index)))] as string;
}
