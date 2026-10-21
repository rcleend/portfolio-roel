/**
 * Maps between the TV screen mesh's UV space and the game's native pixels.
 *
 * The screen mesh carries 0–1 UVs with v = 0 at the top edge (glTF convention), but the
 * bezel overlaps its outer rim, so the game is drawn into a smaller 4:3 "content rect"
 * that sits fully inside the visible glass. The shader and the pointer mapping share that
 * rect, which is what keeps the cursor exactly on the pixel under it.
 */

export interface UvRect {
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
}

export interface NativePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Fits a `contentAspect` rectangle, centred, inside `aperture` after shrinking the aperture
 * by `inset` (a fraction of its size per side). `meshAspect` is the physical width/height of
 * the full 0–1 UV square, needed because UV units are not square on the glass.
 */
export function fitContentRect(aperture: UvRect, meshAspect: number, contentAspect: number, inset: number): UvRect {
  const spanU = (aperture.maxU - aperture.minU) * (1 - 2 * inset);
  const spanV = (aperture.maxV - aperture.minV) * (1 - 2 * inset);
  const apertureAspect = (spanU * meshAspect) / spanV;
  const width = apertureAspect > contentAspect ? (spanV * contentAspect) / meshAspect : spanU;
  const height = apertureAspect > contentAspect ? spanV : (spanU * meshAspect) / contentAspect;
  const centreU = (aperture.minU + aperture.maxU) / 2;
  const centreV = (aperture.minV + aperture.maxV) / 2;
  return {
    minU: centreU - width / 2,
    maxU: centreU + width / 2,
    minV: centreV - height / 2,
    maxV: centreV + height / 2,
  };
}

/**
 * Converts a screen-mesh UV hit into integer native pixel coordinates. Hits on the dark tube
 * border outside the content rect return `null`, unless `clamp` is set: a drag that started
 * on the picture keeps reporting the nearest edge pixel instead of dropping the pointer.
 */
export function uvToNativePixel(
  u: number,
  v: number,
  content: UvRect,
  size: { readonly width: number; readonly height: number },
  clamp = false,
): NativePoint | null {
  const nx = (u - content.minU) / (content.maxU - content.minU);
  const ny = (v - content.minV) / (content.maxV - content.minV);
  const inside = nx >= 0 && nx < 1 && ny >= 0 && ny < 1;
  if (!inside && !clamp) return null;
  const toPixel = (n: number, extent: number): number => Math.min(extent - 1, Math.max(0, Math.floor(n * extent)));
  return { x: toPixel(nx, size.width), y: toPixel(ny, size.height) };
}
