import type { Gfx } from '@/engine/gfx/Gfx';
import type { GameServices } from '../services';

/**
 * Marks a placeholder scene so nobody mistakes it for finished work.
 * Delete this file once every stub scene has been replaced.
 */
export function drawStubBanner(gfx: Gfx, services: GameServices, name: string): void {
  const label = `STUB · ${name}`;
  const style = { ...services.text.hud, fill: '#ffe14d' };
  const width = gfx.measureText(label, style).width;
  gfx.fillRect(gfx.width - width - 7, 2, width + 5, 11, '#000000');
  gfx.text(label, gfx.width - width - 4, 3, style);
}
