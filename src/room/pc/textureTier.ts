/**
 * How big a display's still texture needs to be. The still is only seen during flights and in
 * the room view, never larger than the glass at the landing, so it is sized from that landing:
 * a texture wider than the glass on screen buys nothing but upload time and memory.
 */
export interface TextureSize {
  readonly width: number;
  readonly height: number;
}

/** `navigator.deviceMemory` (GB, coarse) at or below which the texture is capped at 768 wide. */
const LOW_MEMORY_GB = 2;

/**
 * Up to 600 render pixels of glass at the landing get a 512-wide texture, up to 900 a 768-wide
 * one, anything larger 1024.
 *
 * @param glassRenderWidth the glass's width at the landing in render pixels: CSS px × the room's
 *   pixel ratio, since that is the most the texture is ever magnified to.
 * @param glassAspect the glass's physical width / height (the texture covers its whole UV square).
 * @param deviceMemory `navigator.deviceMemory`, when the browser reports it.
 */
export function textureTier(glassRenderWidth: number, glassAspect: number, deviceMemory?: number): TextureSize {
  let width = glassRenderWidth <= 600 ? 512 : glassRenderWidth <= 900 ? 768 : 1024;
  if (deviceMemory !== undefined && deviceMemory <= LOW_MEMORY_GB) width = Math.min(width, 768);
  return { width, height: Math.round(width / glassAspect) };
}
