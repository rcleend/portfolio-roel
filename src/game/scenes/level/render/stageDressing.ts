import { shade } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { MovingPlatform } from '../../../entities/stage/MovingPlatform';
import { TILE } from '../../../world/grid';
import { GROUND_Y } from '../../../world/map/buildGrid';
import type { LevelLayout } from '../../../world/map/layout';
import type { MoverStyle, PitStyle } from '../../../world/stage';

/** A sign sunk into each pit ("SPAM", "BAUSTELLE"), drawn only where it fits. */
export function drawPitSigns(gfx: Gfx, layout: LevelLayout, style: PitStyle, text: TextStyle, viewX: number): void {
  const label = gfx.measureText(style.label, text);
  let from = -1;
  layout.ground.forEach((present, col) => {
    if (!present && from < 0) from = col;
    if (present && from >= 0) {
      const left = from * TILE;
      const width = (col - from) * TILE;
      from = -1;
      if (left + width < viewX || left > viewX + gfx.width || label.width > width - 4) return;
      gfx.text(style.label, left + width / 2, GROUND_Y + 14, { ...text, fill: style.labelColor }, { align: 'center' });
    }
  });
}

/**
 * Rails along a vehicle's track: thin rails in the street over ground and a
 * riveted steel girder bridging every pit, so riding across reads as plausible.
 */
export function drawRails(gfx: Gfx, mover: MovingPlatform, layout: LevelLayout, style: MoverStyle): void {
  const { from, to } = mover.track;
  const light = shade(style.railColor, 0.45);
  gfx.fillRect(from, GROUND_Y - 2, to - from, 1, style.railColor);
  gfx.fillRect(from, GROUND_Y - 1, to - from, 1, style.railShade);
  for (let col = Math.floor(from / TILE); col < Math.ceil(to / TILE); col++) {
    if (layout.ground[col]) continue;
    const x = col * TILE;
    const y = GROUND_Y;
    gfx.fillRect(x, y, TILE, 1, light);
    gfx.fillRect(x, y + 1, TILE, 2, style.railColor);
    gfx.fillRect(x, y + 3, TILE, 1, style.railShade);
    // A Warren truss: one diagonal and one post per tile, alternating direction.
    const rising = col % 2 === 0;
    gfx.line(x, rising ? y + 10 : y + 4, x + TILE - 1, rising ? y + 4 : y + 10, style.railColor);
    gfx.fillRect(x, y + 4, 1, 7, style.railColor);
    gfx.fillRect(x, y + 11, TILE, 2, style.railColor);
    gfx.fillRect(x, y + 13, TILE, 1, style.railShade);
    gfx.pixel(x + 4, y + 1, light);
    gfx.pixel(x + 12, y + 1, light);
  }
}
