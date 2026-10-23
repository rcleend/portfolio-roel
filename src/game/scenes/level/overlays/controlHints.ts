import type { Gfx } from '@/engine/gfx/Gfx';
import { blink } from '@/engine/motion/oscillators';
import type { TextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { drawKeyCap, keyCapWidth } from '../../../ui/hud/KeyCap';
import { type KeyCapLabel, keyCapFor } from '../../../ui/hud/keyLabels';

/** When the hints show, in seconds of scene time. */
export const HINTS = { from: 1.2, until: 10 } as const;

interface Hint {
  readonly actions: readonly Action[];
  readonly label: string;
}

const HINT_ROW: readonly Hint[] = [
  { actions: ['left', 'right'], label: 'MOVE' },
  { actions: ['jump'], label: 'JUMP' },
  { actions: ['attack'], label: 'ATTACK' },
  { actions: ['skill1', 'skill2'], label: 'SKILLS' },
  { actions: ['pause'], label: 'PAUSE' },
];

const GAP = 7;
const Y = 225;

/** A strip of key caps along the bottom for the first seconds of a level. */
export function drawControlHints(gfx: Gfx, text: TextStyles, device: 'keyboard' | 'gamepad', time: number): void {
  if (time < HINTS.from || time > HINTS.until) return;
  if (HINTS.until - time < 1 && !blink(time, 4 / 60, 4 / 60)) return;
  const style = text.label;
  const items = HINT_ROW.map((hint) => ({
    caps: hint.actions.map((action) => keyCapFor(action, device)),
    label: hint.label,
  }));
  const widthOf = (caps: readonly KeyCapLabel[], label: string): number =>
    caps.reduce((sum, cap) => sum + keyCapWidth(gfx, cap, style) + 1, 0) + 2 + gfx.measureText(label, text.hud).width;
  const total = items.reduce((sum, item) => sum + widthOf(item.caps, item.label), 0) + GAP * (items.length - 1);
  gfx.fillRect(0, Y - 3, gfx.width, 16, '#0b0a1f');
  gfx.fillRect(0, Y - 4, gfx.width, 1, '#3d2f8f');
  let x = Math.round((gfx.width - total) / 2);
  for (const item of items) {
    for (const cap of item.caps) x += drawKeyCap(gfx, x, Y - 1, cap, style) + 1;
    x += 2;
    gfx.text(item.label, x, Y + 1, text.hud);
    x += gfx.measureText(item.label, text.hud).width + GAP;
  }
}
