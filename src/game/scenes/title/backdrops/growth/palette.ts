import { parseHex } from '@/engine/gfx/color';

/**
 * The terminal's inks. Teal, green and cyan only: nothing warm, so the
 * orange lockup is the one hot thing on screen and every backdrop colour
 * sits opposite it on the colour wheel.
 */

/**
 * The tube's glass, from unlit black-navy at the corners to the phosphor
 * haze behind the logo. The haze climbs to a mid value on purpose: the
 * logo's dark-red extrusion and near-black outline need a lighter field to
 * read against. Grid lines are the glass a step or two up the same ramp.
 */
export const GLASS = [
  '#01070c',
  '#03111a',
  '#061a26',
  '#0a2332',
  '#0d2b3c',
  '#113447',
  '#153e52',
  '#1a495e',
  '#20546a',
  '#276076',
  '#2f6d82',
  '#387a8e',
  '#438899',
  '#5097a6',
].map(parseHex);

/** Phosphor-green data ink, dark to hot: rest, warm, lit, hot core, white-hot. */
export const INK = ['#0f3b26', '#1f6d40', '#2fae5c', '#5cff8a', '#c8ffd8', '#ffffff'] as const;

/** The cyan secondary series (the bars), dark to bright. */
export const CYAN = ['#08323d', '#0d5463', '#16808f', '#3bc3cf', '#a8f2f6'] as const;

/** Chart chrome: the axes and the ceiling the line breaks through. */
export const AXIS = '#3f97a3';
/** Readouts and labels: a dimmer green than the data, so text never outshines the line. */
export const LABEL = '#2fae5c';

/** The ticker's inks, dimmer again: it sits under the copyright and must never outshine it. */
export const TAPE = { label: '#1f7a45', figure: INK[2], up: INK[3], down: CYAN[2] } as const;
