import type { CharacterId } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import type { ImageSheetSource } from '../module';
import artsyJson from './characters/artsy/sheet.json';
import artsyPng from './characters/artsy/sheet.png';
import hackermanJson from './characters/hackerman/sheet.json';
import hackermanPng from './characters/hackerman/sheet.png';
import strategyJson from './characters/strategy/sheet.json';
import strategyPng from './characters/strategy/sheet.png';

/**
 * A hero's default design in the Terraria style: the Terraria look's own
 * sheet (characters/<hero>/), drawn by tools/looks/terraria. The development
 * lineup stands the designs beside the game's heroes, whatever look the game
 * is set to, so they are loaded here rather than through the look selection.
 */
export interface TerrariaDesign {
  readonly hero: CharacterId;
  readonly sheet: ImageSheetSource;
}

/** Every hero's design, in the heroes' order. */
export const TERRARIA_DESIGNS: readonly TerrariaDesign[] = [
  { hero: 'hackerman', sheet: { png: hackermanPng, json: hackermanJson } },
  { hero: 'artsy', sheet: { png: artsyPng, json: artsyJson } },
  { hero: 'strategy', sheet: { png: strategyPng, json: strategyJson } },
];

const imageKey = (design: TerrariaDesign): string => `looks/terraria/designs/${design.hero}`;

/**
 * Downloads every design into `assets`. The game never does: whoever opens
 * a scene that draws them (the playground, the harness) calls this first, so
 * the scene can read them synchronously.
 */
export async function loadTerrariaDesigns(assets: AssetStore): Promise<void> {
  await Promise.all(TERRARIA_DESIGNS.map((design) => assets.loadImage(imageKey(design), design.sheet.png)));
}

/** The design's sheet, from the image `loadTerrariaDesigns` stored; the store throws if it never ran. */
export function terrariaDesignSheet(assets: AssetStore, design: TerrariaDesign): SpriteSheet {
  const key = imageKey(design);
  return SpriteSheet.fromImage(assets.image(key), parseSpriteSheetSpec(design.sheet.json, `${key}.json`), key);
}
