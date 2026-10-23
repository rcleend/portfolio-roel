import { BitmapFont, parseGlyphSheet } from '@/engine/gfx/BitmapFont';
import { smallFont } from '../../../../art/fonts/small';
import { lazy } from '../../../../art/logos/lazy';

/** What a market terminal prints that the body face lacks: up and down ticks, the live dot and "about". */
const TERMINAL_GLYPHS = parseGlyphSheet(`
= ▲
.....
.....
..#..
.###.
#####

= ▼
.....
.....
#####
.###.
..#..

= ●
.....
.###.
#####
#####
#####
.###.

= ~
.....
.....
.....
.##.#
#..#.
`);

/** The terminal's type: the game's small body face plus market symbols. */
export const terminalType = lazy(() =>
  BitmapFont.fromGlyphData({
    ...smallFont,
    name: 'terminal',
    glyphs: { ...smallFont.glyphs, ...TERMINAL_GLYPHS },
  }),
);
