/**
 * The looks the captain compares piece by piece (docs/LOOKS.md). `classic`
 * is the art the game shipped with; each other look is drawn in one style
 * across every hero, the customer and every skill.
 */
export const LOOK_IDS = ['classic', 'arcade', 'portrait', 'hibit'] as const;

export type LookId = (typeof LOOK_IDS)[number];

export function isLookId(value: unknown): value is LookId {
  return typeof value === 'string' && (LOOK_IDS as readonly string[]).includes(value);
}
