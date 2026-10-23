import silkscreenBoldUrl from '@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2?url';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { BitmapFont, parseGlyphSheet } from '@/engine/gfx/BitmapFont';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { arcadeFont } from './art/fonts/arcade';
import { smallFont } from './art/fonts/small';
import { palette } from './palette';

/**
 * The three typefaces, by role:
 * - `small`  — body copy (bios, briefings, tooltips). Hand-drawn glyph data.
 * - `label`  — 8 px arcade labels and HUD. Silkscreen Bold (OFL), rasterised at its native size.
 * - `arcade` — chunky display prompts. Hand-drawn glyph data.
 */
export interface GameFonts {
  readonly small: BitmapFont;
  readonly label: BitmapFont;
  readonly arcade: BitmapFont;
}

export type TextStyleName = 'body' | 'label' | 'prompt' | 'title' | 'hud' | 'tooltip';
export type TextStyles = Readonly<Record<TextStyleName, TextStyle>>;

const SILKSCREEN = 'Silkscreen';
const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

export async function loadFonts(assets: AssetStore): Promise<{ fonts: GameFonts; styles: TextStyles }> {
  await assets.loadFont({ family: SILKSCREEN, url: silkscreenBoldUrl, descriptors: { weight: '700' } });
  const fonts: GameFonts = {
    small: BitmapFont.fromGlyphData(smallFont),
    arcade: BitmapFont.fromGlyphData(arcadeFont),
    label: BitmapFont.fromTtf({
      name: 'label',
      family: SILKSCREEN,
      weight: 700,
      size: 8,
      chars: PRINTABLE_ASCII,
      lineHeight: 10,
      // Silkscreen's built-in spacing reads airy at 8 px; one pixel tighter matches arcade HUD lettering.
      letterSpacing: -1,
      glyphs: parseGlyphSheet(`
        = ©
        .#####.
        #.###.#
        #.#...#
        #.###.#
        .#####.

        = ·
        ##
        ##
        ..
      `),
    }),
  };
  return { fonts, styles: createTextStyles(fonts) };
}

/** Named styles. Derive variants inline (`{ ...styles.label, fill: palette.gold }`); atlases are cached by value. */
export function createTextStyles(fonts: GameFonts): TextStyles {
  return {
    body: { font: fonts.small, fill: palette.lilac, shadow: { color: palette.ink, x: 1, y: 1 } },
    label: { font: fonts.label, fill: palette.white, shadow: { color: palette.ink, x: 1, y: 1 } },
    prompt: {
      font: fonts.arcade,
      fill: ['#ffffff', '#ffffff', '#e4defc', '#c4b8f5', '#a596e8'],
      bands: 5,
      outline: '#141048',
      shadow: { color: '#141048', x: 1, y: 1 },
    },
    title: {
      font: fonts.arcade,
      fill: ['#fff3a0', '#ffc83d', '#ff9a1f', '#f06414', '#c83a10'],
      bands: 5,
      outline: '#1a0804',
      shadow: { color: '#5a1408', x: 1, y: 2 },
    },
    hud: { font: fonts.label, fill: palette.white, outline: palette.ink },
    tooltip: { font: fonts.small, fill: palette.navy, lineSpacing: 1 },
  };
}
