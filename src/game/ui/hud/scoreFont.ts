import { BitmapFont, type GlyphFontData, parseGlyphSheet } from '@/engine/gfx/BitmapFont';

/**
 * Chunky 8 px HUD numerals with the euro sign the shared faces lack — the
 * score is MRR — plus what highlight metrics need (%, →, ~). Two-pixel
 * strokes so a banded orange fill reads like the Metal Slug timer digits.
 */
export const scoreFontData: GlyphFontData = {
  name: 'score',
  cellHeight: 8,
  ascent: 8,
  lineHeight: 10,
  letterSpacing: 1,
  spaceWidth: 3,
  glyphs: parseGlyphSheet(`
= 0
.###.
##.##
##.##
##.##
##.##
##.##
##.##
.###.

= 1
.##.
###.
.##.
.##.
.##.
.##.
.##.
####

= 2
.###.
##.##
...##
..##.
.##..
##...
##...
#####

= 3
####.
...##
...##
.###.
...##
...##
...##
####.

= 4
...##
..###
.####
##.##
#####
...##
...##
...##

= 5
#####
##...
##...
####.
...##
...##
##.##
.###.

= 6
.###.
##...
##...
####.
##.##
##.##
##.##
.###.

= 7
#####
...##
...##
..##.
..##.
.##..
.##..
.##..

= 8
.###.
##.##
##.##
.###.
##.##
##.##
##.##
.###.

= 9
.###.
##.##
##.##
##.##
.####
...##
...##
.###.

= €
..####
.##..#
#####.
.##...
#####.
.##...
.##..#
..####

= +
......
..##..
..##..
######
######
..##..
..##..
......

= ,
..
..
..
..
..
..
##
.#

= /
...##
...##
..##.
..##.
.##..
.##..
##...
##...

= x
.....
.....
##.##
.###.
..#..
.###.
##.##
.....

= %
##...
##..#
...##
..##.
.##..
##...
#..##
...##

= →
.......
....#..
....##.
#######
#######
....##.
....#..
.......

= -
.....
.....
.....
#####
#####
.....
.....
.....

= ~
......
......
.##..#
######
#..##.
......
......
......

= .
..
..
..
..
..
..
##
##

= ?
.###.
##.##
...##
..##.
.##..
.##..
.....
.##..
`),
};

export const scoreFont: BitmapFont = BitmapFont.fromGlyphData(scoreFontData);
