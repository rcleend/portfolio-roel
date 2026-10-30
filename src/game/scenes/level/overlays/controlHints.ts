import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { drawKeyCap, keyCapWidth } from '../../../ui/hud/KeyCap';
import { type ControlDevice, type KeyCapLabel, keyCapFor } from '../../../ui/hud/keyLabels';

/** When the hints show, in seconds of scene time: from just after the level opens, for as long as it lasts. */
export const HINTS = { from: 1.2 } as const;

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

/**
 * The top of the hints' strip once it shows, or null before: the screen
 * rows from there down are the HUD's.
 */
export function controlHintsTop(time: number): number | null {
  return time < HINTS.from ? null : Y - 4;
}

/**
 * A strip of key caps along the bottom of the level, there the whole time:
 * the keys, the gamepad's buttons or, on a touch screen, the pad's own
 * controls (its d-pad once for both directions).
 */
export function drawControlHints(gfx: Gfx, text: TextStyles, device: ControlDevice, time: number): void {
  if (time < HINTS.from) return;
  const style = text.label;
  const items = HINT_ROW.map((hint) => ({
    caps: distinct(hint.actions.map((action) => keyCapFor(action, device))),
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

/** The caps without repeats: the d-pad stands for both of MOVE's directions. */
function distinct(caps: readonly KeyCapLabel[]): readonly KeyCapLabel[] {
  return caps.filter(
    (cap, index) => caps.findIndex((other) => JSON.stringify(other) === JSON.stringify(cap)) === index,
  );
}
