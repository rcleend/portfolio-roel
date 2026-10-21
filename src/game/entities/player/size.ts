/**
 * The player's collision box. Narrower and shorter than the 32 × 40 sprite
 * frame (the head's top pixels and the arms stay out of it), so near misses
 * read as misses.
 */
export const PLAYER_SIZE = { w: 12, h: 28 } as const;
