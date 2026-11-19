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
 * of the room's background work and no frame waits for the whole image. The posters' painted atlas goes up this way (posters/posterKit.ts).
 */

/** Rows a strip uploads: 2048 × 128 × 4 B = 1 MB, about a millisecond. */
export const STRIP_ROWS = 128;

/**
 * The unpack parameters three's `copyTextureToTexture` saves and restores around every copy (WebGL 2 names, values
 * fixed by the spec): ROW_LENGTH, SKIP_ROWS, SKIP_PIXELS, SKIP_IMAGES, IMAGE_HEIGHT.
 */
export const UNPACK_SUBRECT_PARAMETERS: readonly number[] = [0x0cf2, 0x0cf3, 0x0cf4, 0x806d, 0x806e];

/** What a strip upload needs of three's renderer. */
export interface StripRenderer {
  /** three's GL state cache (WebGLState). */
  readonly state: { pixelStorei(name: number, value: number): void };
  initTexture(texture: Texture): void;
  copyTextureToTexture(source: Texture, target: Texture, region: Box2 | null, position: Vector2 | null): void;
}

/**
 * An empty texture with storage for every level and an atlas's settings (no flip, sRGB, mipmaps, the given
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
  primeUnpackState(renderer);
  return target;
}

/**
 * Puts the unpack parameters' WebGL 2 defaults (0) in three's state cache. three reads the current values to restore
 * them after each copy, from the cache when it has them and otherwise with `gl.getParameter`, which waits for the GPU
 * to finish everything queued before it: on the page's first strip, the flight's frames and the room's uploads
 * (measured on a software GPU: 250-780 ms of main thread, in the first flight). Setting a cached value is free, and
 * setting an uncached one is one `pixelStorei`, which waits for nothing.
 */
function primeUnpackState(renderer: StripRenderer): void {
  for (const name of UNPACK_SUBRECT_PARAMETERS) renderer.state.pixelStorei(name, 0);
}

/**
 * Copies `image` into `target` one strip per unit (each yielding `QUIET` before the next, so a strip waits for a
 * quiet moment or, in an urgent task, goes between frames); the mipmaps are made once, with the last strip. The
 * caller owns the image (a decoded bitmap, or a canvas it painted) and closes it.
 */
export function* uploadStrips(
  renderer: StripRenderer,
  image: ImageBitmap | HTMLCanvasElement,
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
