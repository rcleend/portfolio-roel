/**
 * The looks the captain compares piece by piece (docs/LOOKS.md). `classic`
 * is the art the game shipped with; each other look is drawn in one style
 * across whichever heroes, customer and skills it covers. `terraria-revised`
 * and `terraria-hooded` are the Terraria heroes' revision, played beside them.
 */
export const LOOK_IDS = [
  'classic',
  'arcade',
  'portrait',
  'hibit',
  'terraria',
  'terraria-revised',
  'terraria-hooded',
] as const;

export type LookId = (typeof LOOK_IDS)[number];

export function isLookId(value: unknown): value is LookId {
  return typeof value === 'string' && (LOOK_IDS as readonly string[]).includes(value);
}
