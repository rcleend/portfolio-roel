/**
 * How big a display's still texture needs to be. The still is only seen during flights and in
 * the room view, never larger than the glass at the landing, so it is sized from that landing:
 * a texture wider than the glass on screen buys nothing but upload time and memory.
 */
export interface TextureSize {
  readonly width: number;
  readonly height: number;
}

/** Texture widths by the glass's width on screen at the landing, in render pixels. */
const TIERS = [
  { upTo: 600, width: 512 },
  { upTo: 900, width: 768 },
] as const;
const LARGEST = 1024;
/** `navigator.deviceMemory` (GB, coarse) at or below which the texture is capped. */
const LOW_MEMORY_GB = 2;
const LOW_MEMORY_WIDTH = 768;

/**
 * @param glassRenderWidth the glass's width at the landing in render pixels: CSS px × the room's
 *   pixel ratio, since that is the most the texture is ever magnified to.
 * @param glassAspect the glass's physical width / height (the texture covers its whole UV square).
 * @param deviceMemory `navigator.deviceMemory`, when the browser reports it.
 */
export function textureTier(glassRenderWidth: number, glassAspect: number, deviceMemory?: number): TextureSize {
  let width: number = TIERS.find((tier) => glassRenderWidth <= tier.upTo)?.width ?? LARGEST;
  if (deviceMemory !== undefined && deviceMemory <= LOW_MEMORY_GB) width = Math.min(width, LOW_MEMORY_WIDTH);
  return { width, height: Math.round(width / glassAspect) };
}
