import { mod } from '../math/scalar';
import type { PixelImage } from './canvas';
import type { Gfx } from './Gfx';

export interface ParallaxLayer {
  readonly image: PixelImage;
  /** How far the layer moves per pixel of camera motion: 0 = fixed sky, 1 = moves with the world. */
  readonly factor: number;
  /** Screen y of the layer's top edge before vertical parallax. */
  readonly y?: number;
  /** Vertical parallax factor; defaults to 0 because most stages scroll horizontally only. */
  readonly factorY?: number;
  /** Tile horizontally so the layer never runs out. */
  readonly repeatX?: boolean;
  /** Constant drift in pixels per second (clouds, fog), independent of the camera. */
  readonly drift?: number;
}

/**
 * Draws back-to-front parallax layers for a camera position. Offsets are
 * snapped per layer, so every layer moves in whole pixels like real hardware
 * scroll planes.
 */
export function drawParallax(gfx: Gfx, layers: readonly ParallaxLayer[], cameraX: number, cameraY = 0, time = 0): void {
  for (const layer of layers) {
    const scrollX = Math.round(cameraX * layer.factor - time * (layer.drift ?? 0));
    const y = Math.round((layer.y ?? 0) - cameraY * (layer.factorY ?? 0));
    const width = layer.image.width;
    if (!layer.repeatX) {
      gfx.image(layer.image, -scrollX, y);
      continue;
    }
    for (let x = -mod(scrollX, width); x < gfx.width; x += width) gfx.image(layer.image, x, y);
  }
}
