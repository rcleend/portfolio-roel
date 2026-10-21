import type { Gfx } from '@/engine/gfx/Gfx';
import type { ParallaxLayer } from '@/engine/gfx/Parallax';
import type { ForegroundStyle } from '../../../world/stage';

/**
 * Draws foreground layers (poles, lamps passing in front of the player) but
 * only every n-th repetition: the art repeats every few hundred pixels,
 * which at full density walls off the play plane. Sparse, they read as
 * occasional depth cues instead.
 *
 * Copies that would still be on screen once the camera reaches `lastCameraX`
 * (the locked arena) are skipped entirely, so nothing ever stands in front
 * of the boss fight and no copy pops out mid-screen.
 */
export function drawSparseForeground(
  gfx: Gfx,
  layers: readonly ParallaxLayer[],
  cameraX: number,
  style: ForegroundStyle,
  lastCameraX: number,
): void {
  for (const layer of layers) {
    const width = layer.image.width;
    const scrollX = Math.round(cameraX * layer.factor);
    const y = Math.round(layer.y ?? 0);
    for (let copy = Math.floor(scrollX / width); copy * width - scrollX < gfx.width; copy++) {
      if (((copy % style.every) + style.every) % style.every !== style.offset) continue;
      if ((copy + 1) * width > lastCameraX * layer.factor) continue;
      gfx.image(layer.image, copy * width - scrollX, y);
    }
  }
}
