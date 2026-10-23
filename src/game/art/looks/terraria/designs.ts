import type { CharacterId } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import type { ImageSheetSource } from '../module';
import artsyJson from './designs/artsy.json';
import artsyPng from './designs/artsy.png';
import hackermanJson from './designs/hackerman.json';
import hackermanPng from './designs/hackerman.png';
import strategyJson from './designs/strategy.json';
import strategyPng from './designs/strategy.png';

/**
 * A hero's still default design in the Terraria style, drawn by
 * tools/looks/terraria/generate.py: one standing `idle` frame, 32 × 40 on
 * the feet line. The designs are not a look (docs/LOOKS.md): nothing
 * registers them, and only the development lineup shows them, until they
 * are animated.
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
