/**
 * The television's own on-screen display. It is drawn by the TV, not the game, so it lives
 * in the room: a blocky late-90s OSD font rendered at the game's native resolution and
 * composited by the CRT shader before scanlines, exactly like a real OSD chip.
 */

/** 5×7 glyphs; '#' is a lit pixel. Only what the OSD needs. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  '|': ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_SPACING = 1;

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Lit pixels of `text` at integer `scale`, as rects relative to the text's top-left. */
export function layoutOsdText(text: string, scale: number): { rects: PixelRect[]; width: number; height: number } {
  const rects: PixelRect[] = [];
  [...text].forEach((char, index) => {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`OSD font has no glyph for "${char}"`);
    const originX = index * (GLYPH_WIDTH + GLYPH_SPACING) * scale;
    glyph.forEach((line, y) => {
      [...line].forEach((cell, x) => {
        if (cell === '#') rects.push({ x: originX + x * scale, y: y * scale, w: scale, h: scale });
      });
    });
  });
  const width = (text.length * (GLYPH_WIDTH + GLYPH_SPACING) - GLYPH_SPACING) * scale;
  return { rects, width, height: GLYPH_HEIGHT * scale };
}

const OSD_GREEN = '#46ff6a';
const OSD_SHADOW = '#001a06';

/** A transparent canvas of the game's size with the PAUSE indicator drawn on it. */
export function createPauseOsd(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable for the TV on-screen display');

  const scale = Math.max(1, Math.round(height / 80));
  const { rects, width: textWidth } = layoutOsdText('| PAUSE', scale);
  const left = Math.round((width - textWidth) / 2);
  const top = Math.round(height * 0.16);
  const paint = (color: string, dx: number, dy: number): void => {
    context.fillStyle = color;
    for (const r of rects) context.fillRect(left + r.x + dx, top + r.y + dy, r.w, r.h);
  };
  paint(OSD_SHADOW, scale, scale);
  paint(OSD_GREEN, 0, 0);
  return canvas;
}
