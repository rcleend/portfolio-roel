import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { KeyCapLabel, PadGlyph } from './keyLabels';

const HEIGHT = 11;
const COLORS = { outline: '#0b0a1f', face: '#e4dcff', light: '#ffffff', side: '#8a80c0', ink: '#14123a' } as const;

/** The touch pad's colours (app/overlays/touchpad/TouchPad.css): each button's face, shade and light, and the dark body. */
const PAD_TONES: Readonly<Record<PadButton, readonly [face: string, shade: string, light: string]>> = {
  red: ['#e2352d', '#9c1d17', '#ff8a6e'],
  yellow: ['#ffc83d', '#c47f0e', '#fff1a8'],
  green: ['#3ddc84', '#1f9353', '#b6ffd2'],
  blue: ['#1f6fff', '#1340a6', '#8fc0ff'],
};

type PadButton = Exclude<PadGlyph, 'dpad' | 'start'>;

/** The letter each pad button carries, so the four read apart without their colours (the gamepad's own). */
export const PAD_LETTERS: Readonly<Record<PadButton, string>> = { red: 'A', yellow: 'X', green: 'Y', blue: 'B' };
/** The pad's body, lifted a step so it holds on the hints' dark strip, its highlight and its arrows. */
const PAD_BODY = { body: '#3d3866', light: '#5d5790', arrow: '#c9c1ff' } as const;
const START_WIDTH = 15;

/** Width of the key cap `drawKeyCap` would draw. */
export function keyCapWidth(gfx: Gfx, label: KeyCapLabel, style: TextStyle): number {
  if ('pad' in label) return label.pad === 'start' ? START_WIDTH : HEIGHT;
  return 'arrow' in label ? HEIGHT : Math.max(HEIGHT, gfx.measureText(label.text, style).width + 6);
}

/**
 * A little raised keyboard key with its legend, for control hints: light
 * face, darker bottom edge, one-pixel outline. Returns the width drawn.
 */
export function drawKeyCap(gfx: Gfx, x: number, y: number, label: KeyCapLabel, style: TextStyle): number {
  const width = keyCapWidth(gfx, label, style);
  if ('pad' in label) {
    drawPadGlyph(gfx, x, y, label.pad, style);
    return width;
  }
  gfx.fillRect(x + 1, y, width - 2, HEIGHT, COLORS.outline);
  gfx.fillRect(x, y + 1, width, HEIGHT - 2, COLORS.outline);
  gfx.fillRect(x + 1, y + 1, width - 2, HEIGHT - 2, COLORS.side);
  gfx.fillRect(x + 1, y + 1, width - 2, HEIGHT - 4, COLORS.face);
  gfx.fillRect(x + 2, y + 1, width - 4, 1, COLORS.light);
  if ('arrow' in label) {
    drawArrow(gfx, x + Math.floor(width / 2), y + 4, label.arrow);
  } else {
    gfx.text(
      label.text,
      x + Math.floor(width / 2),
      y + 2,
      { ...style, fill: COLORS.ink, outline: undefined, shadow: undefined },
      {
        align: 'center',
      },
    );
  }
  return width;
}

/** A 5-pixel solid arrow head centred on (cx, cy + 1). */
function drawArrow(gfx: Gfx, cx: number, cy: number, direction: 'left' | 'right' | 'up' | 'down'): void {
  for (let i = 0; i < 3; i++) {
    const length = 1 + i * 2;
    switch (direction) {
      case 'left':
        gfx.fillRect(cx - 1 + i, cy + 1 - i, 1, length, COLORS.ink);
        break;
      case 'right':
        gfx.fillRect(cx + 1 - i, cy + 1 - i, 1, length, COLORS.ink);
        break;
      case 'up':
        gfx.fillRect(cx - i, cy + i, length, 1, COLORS.ink);
        break;
      case 'down':
        gfx.fillRect(cx - i, cy + 2 - i, length, 1, COLORS.ink);
        break;
    }
  }
}

/** One of the touch pad's controls at a key cap's height: the d-pad, a round lettered button in its colour, or Start. */
function drawPadGlyph(gfx: Gfx, x: number, y: number, glyph: PadGlyph, style: TextStyle): void {
  if (glyph === 'dpad') drawDpad(gfx, x, y);
  else if (glyph === 'start') drawStart(gfx, x, y);
  else {
    drawButton(gfx, x, y, PAD_TONES[glyph]);
    const ink = { ...style, fill: COLORS.ink, outline: undefined, shadow: undefined };
    gfx.text(PAD_LETTERS[glyph], x + Math.floor(HEIGHT / 2) + 1, y + 2, ink, { align: 'center' });
  }
}

/** A plus of 3 px arms in an outline, lit along its top, with the left and right arrows the player moves with. */
function drawDpad(gfx: Gfx, x: number, y: number): void {
  gfx.fillRect(x + 3, y, 5, HEIGHT, COLORS.outline);
  gfx.fillRect(x, y + 3, HEIGHT, 5, COLORS.outline);
  gfx.fillRect(x + 4, y + 1, 3, HEIGHT - 2, PAD_BODY.body);
  gfx.fillRect(x + 1, y + 4, HEIGHT - 2, 3, PAD_BODY.body);
  gfx.fillRect(x + 4, y + 1, 3, 1, PAD_BODY.light);
  gfx.fillRect(x + 1, y + 4, 3, 1, PAD_BODY.light);
  gfx.fillRect(x + 7, y + 4, 3, 1, PAD_BODY.light);
  // ◂ and ▸ on the side arms.
  gfx.fillRect(x + 2, y + 5, 1, 1, PAD_BODY.arrow);
  gfx.fillRect(x + 3, y + 4, 1, 3, PAD_BODY.arrow);
  gfx.fillRect(x + 8, y + 5, 1, 1, PAD_BODY.arrow);
  gfx.fillRect(x + 7, y + 4, 1, 3, PAD_BODY.arrow);
}

/** The rows of an 11 px disc: each row's first column and width. */
const DISC: readonly (readonly [number, number])[] = [
  [3, 5],
  [1, 9],
  [1, 9],
  [0, 11],
  [0, 11],
  [0, 11],
  [0, 11],
  [0, 11],
  [1, 9],
  [1, 9],
  [3, 5],
];

/** A round arcade button: outlined disc, its face, a darker lower rim and a glint at the upper left (under the letter). */
function drawButton(gfx: Gfx, x: number, y: number, [face, shade, light]: readonly [string, string, string]): void {
  DISC.forEach(([from, width], row) => {
    gfx.fillRect(x + from, y + row, width, 1, COLORS.outline);
    if (row === 0 || row === HEIGHT - 1) return;
    const inset = row === 1 || row === HEIGHT - 2 ? 2 : 1;
    gfx.fillRect(x + from + inset, y + row, width - inset * 2, 1, row >= HEIGHT - 3 ? shade : face);
  });
  gfx.fillRect(x + 2, y + 2, 1, 1, light);
}

/** The pad's Start: a small dark pill with a lit top edge, centred on the key cap's row. */
function drawStart(gfx: Gfx, x: number, y: number): void {
  const top = y + 2;
  gfx.fillRect(x + 1, top, START_WIDTH - 2, 7, COLORS.outline);
  gfx.fillRect(x, top + 1, START_WIDTH, 5, COLORS.outline);
  gfx.fillRect(x + 1, top + 1, START_WIDTH - 2, 5, PAD_BODY.body);
  gfx.fillRect(x + 2, top + 1, START_WIDTH - 4, 1, PAD_BODY.light);
}
