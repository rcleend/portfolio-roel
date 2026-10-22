import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { WindowTheme } from './theme';
import { drawWindow } from './Window';

/** The icon size every screen's slots were laid out around: classic's. */
const CLASSIC_ICON = 16;

/**
 * The side of a square bevelled slot for `icons`: `minimum`, the slot the
 * screen was laid out with for classic's icons, grown for a look's bigger
 * ones so they keep the same margin (4 px inside the select screen's bevel,
 * 3 px in the HUD). Sizing every slot from the largest icon keeps a row of
 * slots even when looks are mixed.
 */
export function iconSlotSize(minimum: number, icons: readonly SpriteSheet[]): number {
  const largest = Math.max(0, ...icons.map((icon) => Math.max(icon.width, icon.height)));
  return Math.max(minimum, largest + minimum - CLASSIC_ICON);
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
