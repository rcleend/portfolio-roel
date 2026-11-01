import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { Action } from '../input/bindings';
import { drawKeyCap, keyCapWidth } from './hud/KeyCap';
import { type ControlDevice, keyCapFor } from './hud/keyLabels';
import { legendGlyphTop } from './KeyHints';

/** The actions a one-line prompt names, and the word a keyboard or gamepad player reads for each. */
export type PromptAction = Extract<Action, 'confirm' | 'back' | 'up' | 'pause'>;
const WORDS: Readonly<Record<Exclude<PromptAction, 'pause'>, string>> = { confirm: 'CONFIRM', back: 'BACK', up: 'UP' };
const PAD_GLYPH_HEIGHT = 11;
const GAP = 3;

/**
 * A one-line prompt such as "CONFIRM: CLOSE", drawn at `x` (its left or right edge, by `align`) on the text row `y`.
 * A touch screen has no Enter or Back key: there the touch pad's own control is drawn instead of the word, in its
 * colour and letter (A to confirm, B to go back, the d-pad for up, its Start to pause), beside the label.
 */
export function drawPrompt(
  gfx: Gfx,
  x: number,
  y: number,
  style: TextStyle,
  prompt: { readonly action: PromptAction; readonly label: string; readonly device: ControlDevice },
  align: 'left' | 'center' | 'right' = 'left',
): void {
  const { action, device } = prompt;
  if (device !== 'touch') {
    // Pausing is a key of its own: Escape on a keyboard, Start on a gamepad.
    const word = action === 'pause' ? (device === 'keyboard' ? 'ESC' : 'START') : WORDS[action];
    gfx.text(`${word}: ${prompt.label}`, x, y, style, { align });
    return;
  }
  const cap = keyCapFor(action, 'touch');
  const width = keyCapWidth(cap, style) + GAP + gfx.measureText(prompt.label, style).width;
  const left = align === 'right' ? x - width : align === 'center' ? Math.round(x - width / 2) : x;
  drawKeyCap(gfx, left, legendGlyphTop(y, style, PAD_GLYPH_HEIGHT), cap, style);
  gfx.text(prompt.label, left + keyCapWidth(cap, style) + GAP, y, style);
}
