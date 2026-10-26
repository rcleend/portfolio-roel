/**
 * What the radio spends on a device (docs/ROOM.md › The CD player), decided from facts, never guessed: the 2K
 * skin where it shows and fits, and a slow tier (no ambient float, short arrivals, the smallest labels) for
 * software renderers and machines that could not keep up with the first flight to the radio (`isSlow`, shared with
 * the posters in ../../stage/slowDevice.ts).
 */

/**
 * Texels the shipped 1K atlas spends across the radio's front panel (its island, measured in the baked atlas): the
 * panel's mark, scale and key glyphs resolve only this finely, whatever the screen.
 */
export const ATLAS_1K_PANEL_TEXELS = 158;
/**
 * From this many device pixels across the radio body the 1K atlas is magnified more than twofold and its panel
 * smears (a 1366 × 768 laptop at DPR 1 is well past it); the 2K skin doubles the panel's texels.
 */
export const SKIN_MIN_RENDER_WIDTH = 2 * ATLAS_1K_PANEL_TEXELS;

export interface SkinTierFacts {
  /** The radio body's width at the radio pose in CSS px. */
  readonly bodyWidthCss: number;
  readonly pixelRatio: number;
  /** `navigator.deviceMemory` (GB), undefined where unknown. */
  readonly deviceMemory: number | undefined;
  readonly saveData: boolean;
  readonly slow: boolean;
}

/** The 2K skin is worth its 16.8 MB of GPU memory wherever the 1K atlas is visibly magnified, and it fits. */
export function wantsSkin(facts: SkinTierFacts): boolean {
  return (
    facts.bodyWidthCss * facts.pixelRatio > SKIN_MIN_RENDER_WIDTH &&
    (facts.deviceMemory === undefined || facts.deviceMemory > 2) &&
    !facts.saveData &&
    !facts.slow
  );
}
