/**
 * Where the terminal's parts sit, in screen pixels. The chart wraps the
 * classic lockup: its flat start runs in the gap between the logo and the
 * prompt and its rise climbs past the logo's right edge, so the whole
 * hockey stick stays in view once the words have landed. The strips below
 * leave the scene's prompt and copyright rows clear.
 */
export const CHART = {
  /** The y axis. */
  left: 26,
  /** The ceiling the line breaks through. */
  top: 14,
  /** The floor (x axis); the chart is open to the right, where the future is. */
  bottom: 158,
} as const;

/** Square grid cells, with a solid major line every few. */
export const GRID = { cell: 12, major: 3 } as const;

/** The value axis: a tick per major grid row, labelled only at the floor and the ceiling. */
export const SCALE = { steps: 4, top: 100 } as const;

/** The bar pane between the prompt and the copyright rows. */
export const BARS = {
  left: CHART.left + 2,
  /** The row the bars stand on. */
  floor: 211,
  /** Bars take one grid cell each, less the gap. */
  width: 8,
  pitch: GRID.cell,
  count: 24,
} as const;

/** The ticker strip along the bottom edge, under the copyright. */
export const TICKER = {
  top: 228,
  /** Where the strip's glyph cells start. */
  textY: 231,
  /** The fixed "LIVE" tag on the left; the tape scrolls out from under it. */
  tagWidth: 40,
} as const;

/** The top row's readout, above the ceiling. */
export const READOUT = { x: CHART.left + 2, y: 3 } as const;
