/**
 * The player's collision box. Narrower and shorter than the sprite frame
 * (the head's top pixels and the arms stay out of it), so near misses read
 * as misses. It is the same in every look, however tall the art is drawn.
 */
export const PLAYER_SIZE = { w: 12, h: 28 } as const;

/** Where shots and beams leave from: this far in front of the body's centre, this high above the feet. */
export const HAND = { reach: 10, height: 17 } as const;
