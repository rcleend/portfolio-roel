import { createCanvas, paintCanvas } from '@/engine/gfx/canvas';
import { parseHex } from '@/engine/gfx/color';
import type { BandedGradient } from '@/engine/gfx/Gfx';
import type { NineSlice } from '@/engine/gfx/NineSlice';
import { pixels } from '@/engine/gfx/PixelArt';

/**
 * Bevelled Neo Geo menu frames. One 12 × 12 pattern is tiled as a nine-slice
 * in each theme's colours: a raised outer rim around an inset panel.
 */
export interface WindowTheme {
  readonly outline: string;
  readonly light: string;
  readonly mid: string;
  readonly dark: string;
  readonly fill: BandedGradient;
}

export type WindowThemeName = 'indigo' | 'steel' | 'cream';

export const windowThemes: Readonly<Record<WindowThemeName, WindowTheme>> = {
  indigo: {
    outline: '#0b0a1f',
    light: '#e4dcff',
    mid: '#a99cf0',
    dark: '#3d2f8f',
    fill: { stops: ['#2a2468', '#14123a'], bands: 4, dither: 'bayer2' },
  },
  steel: {
    outline: '#0b0a14',
    light: '#eef0f6',
    mid: '#8a90a8',
    dark: '#3a3f57',
    fill: { stops: ['#343852', '#181a28'], bands: 4, dither: 'bayer2' },
  },
  cream: {
    outline: '#2a2010',
    light: '#fffdf0',
    mid: '#e6d7a0',
    dark: '#a8955e',
    fill: { stops: ['#fffae6', '#f1e6bd'], bands: 3 },
  },
};

/** Border thickness of the frame pattern; content should start inside it. */
export const WINDOW_BORDER = 4;

const FRAME_PATTERN = pixels(`
  .oooooooooo.
  oLLLLLLLLLLo
  oLmmmmmmmmdo
  oLmddddddmdo
  oLmd....Lmdo
  oLmd....Lmdo
  oLmd....Lmdo
  oLmd....Lmdo
  oLmLLLLLLmdo
  oLmmmmmmmmdo
  oddddddddddo
  .oooooooooo.
`);

// Keyed by colours, not identity, so derived themes (`{ ...theme, fill }`) reuse the same frame.
const sliceCache = new Map<string, NineSlice>();

/** The theme's frame as a nine-slice with a transparent centre, built once per theme. */
export function windowSlice(theme: WindowTheme): NineSlice {
  const key = [theme.outline, theme.light, theme.mid, theme.dark].join('|');
  let slice = sliceCache.get(key);
  if (!slice) {
    const colors: Record<string, string> = { o: theme.outline, L: theme.light, m: theme.mid, d: theme.dark };
    const size = FRAME_PATTERN.length;
    const canvas = createCanvas(size, size);
    paintCanvas(canvas, (ctx) => {
      const image = ctx.createImageData(size, size);
      FRAME_PATTERN.forEach((row, y) => {
        [...row].forEach((key, x) => {
          const hex = colors[key];
          if (!hex) return;
          const { r, g, b, a } = parseHex(hex);
          image.data.set([r, g, b, a], (y * size + x) * 4);
        });
      });
      ctx.putImageData(image, 0, 0);
    });
    slice = {
      image: canvas,
      insets: { top: WINDOW_BORDER, right: WINDOW_BORDER, bottom: WINDOW_BORDER, left: WINDOW_BORDER },
    };
    sliceCache.set(key, slice);
  }
  return slice;
}
