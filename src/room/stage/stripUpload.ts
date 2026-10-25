import {
  type Box2,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
} from 'three';
import { type IdleUnit, QUIET } from './IdleWork';

/**
 * A large texture goes to the GPU a strip at a time (docs/ROOM.md › Background work): a whole 2048-wide upload
 * measured 30–40 ms (80 ms on a slow phone) in one piece, a 1 MB strip about a millisecond, so each strip is one unit
 * of the room's background work and no frame waits for the whole image. Shared by the radio's 2K skin and the posters.
 */

/** Rows a strip uploads: 2048 × 128 × 4 B = 1 MB, about a millisecond. */
export const STRIP_ROWS = 128;

/** What a strip upload needs of three's renderer. */
export interface StripRenderer {
  initTexture(texture: Texture): void;
  copyTextureToTexture(source: Texture, target: Texture, region: Box2 | null, position: Vector2 | null): void;
}

/**
 * An empty texture with storage for every level and a glTF atlas's settings (no flip, sRGB, mipmaps, the given
 * anisotropy), ready for strips.
 */
export function allocateStripTarget(
  renderer: StripRenderer,
  width: number,
  height: number,
  anisotropy: number,
): DataTexture {
  const target = new DataTexture(null, width, height, RGBAFormat, UnsignedByteType);
  target.flipY = false;
  target.colorSpace = SRGBColorSpace;
  target.generateMipmaps = true;
  target.minFilter = LinearMipmapLinearFilter;
  target.magFilter = LinearFilter;
  target.anisotropy = anisotropy;
  target.source.dataReady = false;
  // Only a texture marked for upload gets any storage: unmarked, three binds no texture at all, every strip fails
  // (GL_INVALID_VALUE) and whatever samples it draws black.
  target.needsUpdate = true;
  renderer.initTexture(target);
  return target;
}

/**
 * Copies `image` into `target` one strip per unit (each yielding `QUIET` before the next, so a strip waits for a
 * quiet moment or, in an urgent task, goes between frames); the mipmaps are made once, with the last strip. The
 * caller owns the image and closes it.
 */
export function* uploadStrips(
  renderer: StripRenderer,
  image: ImageBitmap,
  target: Texture,
  rows: number = STRIP_ROWS,
): Generator<IdleUnit, void, void> {
  const { width, height } = image;
  const source = new Texture(image);
  const region = { min: new Vector2(), max: new Vector2(), isBox2: true } as unknown as Box2;
  const at = new Vector2();
  try {
    for (let row = 0; row < height; row += rows) {
      const last = row + rows >= height;
      region.min.set(0, row);
      region.max.set(width, Math.min(height, row + rows));
      at.set(0, row);
      target.generateMipmaps = last;
      renderer.copyTextureToTexture(source, target, region, at);
      if (!last) yield QUIET;
    }
  } finally {
    target.generateMipmaps = true;
  }
}
