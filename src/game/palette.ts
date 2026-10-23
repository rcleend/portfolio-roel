/**
 * Shared colours for UI and placeholder screens, so every crew's screens
 * agree on what "navy" or "lavender" means. Scene-specific art keeps its own
 * palettes next to the art.
 */
export const palette = {
  black: '#000000',
  white: '#ffffff',
  ink: '#0b0a1f',
  navy: '#14123a',
  indigo: '#231e5c',
  violet: '#3d2f8f',
  lavender: '#a99cf0',
  lilac: '#d9d0ff',
  royal: '#1f6fff',
  sky: '#6fb6ff',
  cream: '#efe3b5',
  gold: '#ffc83d',
  orange: '#ff7a1a',
  red: '#e2352d',
  green: '#3ddc84',
  steel: '#8a90a8',
  steelDark: '#454a63',
  khakiDark: '#3f3424',
  khakiLight: '#b3ab90',
} as const;

export type PaletteColor = keyof typeof palette;
