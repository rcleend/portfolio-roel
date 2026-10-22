import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { WindowTheme } from './theme';
import { drawWindow } from './Window';

/** Room around an icon inside its slot; the bevel's inner ring may just touch it, as in the HUD. */
const ICON_MARGIN = 3;

/**
 * The side of a square bevelled slot for `icons`: `minimum` — what the screen
 * was laid out around — or, for a look with bigger icons, enough to fit the
 * largest of them. Sizing every slot from the largest keeps a row of slots even
 * when looks are mixed.
 */
export function iconSlotSize(minimum: number, icons: readonly SpriteSheet[]): number {
  const largest = Math.max(0, ...icons.map((icon) => Math.max(icon.width, icon.height)));
  return Math.max(minimum, largest + ICON_MARGIN * 2);
}

/** Where `icon` sits centred in a slot of `size` at (x, y). */
export function iconInSlot(icon: SpriteSheet, x: number, y: number, size: number): { x: number; y: number } {
  return {
    x: x + Math.floor((size - icon.width) / 2) + icon.origin.x,
    y: y + Math.floor((size - icon.height) / 2) + icon.origin.y,
  };
}

/** A bevelled slot of `size` at (x, y) with `icon`'s idle loop at `time` centred in it. */
export function drawIconSlot(
  gfx: Gfx,
  icon: SpriteSheet<'idle'>,
  time: number,
  slot: { readonly x: number; readonly y: number; readonly size: number; readonly theme: WindowTheme },
): void {
  drawWindow(gfx, { x: slot.x, y: slot.y, w: slot.size, h: slot.size }, slot.theme);
  const at = iconInSlot(icon, slot.x, slot.y, slot.size);
  gfx.sprite(icon, 'idle', time, at.x, at.y);
}
