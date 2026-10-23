import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import { TILE } from '../../../world/grid';
import type { World } from '../../../world/World';

/** `?debug=hitboxes`-style overlay: every collision box in a colour per kind, drawn in world space. */
export function drawHitboxes(gfx: Gfx, world: World): void {
  const box = (rect: Rect, color: string) => gfx.rect(rect.x, rect.y, rect.w, rect.h, color);
  const { grid } = world;
  const view = world.view;
  for (let col = Math.floor(view.x / TILE); col <= Math.floor((view.x + view.w) / TILE); col++) {
    for (let row = 0; row < grid.rows; row++) {
      const kind = grid.kindAt(col, row);
      if (kind === 'empty') continue;
      const rect = { x: grid.colLeft(col), y: grid.rowTop(row), w: TILE, h: kind === 'oneWay' ? 2 : TILE };
      box(rect, kind === 'solid' ? '#ffffff55' : '#6fe8ff');
    }
  }
  for (const surface of [...world.movers, ...world.barriers]) box(surface.rect, '#6fe8ff');
  for (const gate of world.gates) if (gate.wall) box(gate.wall, '#ff3a3a');
  for (const zone of world.slowZones) box(zone.rect, '#3ddc84');
  for (const customer of world.customers) box(customer.rect, customer.active ? '#ff3a4a' : '#ff9ad8');
  for (const bubble of world.bubbles) box(bubble.rect, '#ffd84a');
  for (const shot of world.shots) box(shot.rect, '#7dff9a');
  box(world.player.rect, world.player.isInvulnerable(world.time) ? '#a99cf0' : '#ffffff');
}
