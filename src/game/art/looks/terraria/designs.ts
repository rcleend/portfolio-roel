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
import revisedArtsyJson from './revised/artsy/sheet.json';
import revisedArtsyPng from './revised/artsy/sheet.png';
import revisedHackermanJson from './revised/hackerman/sheet.json';
import revisedHackermanPng from './revised/hackerman/sheet.png';
import revisedHoodedJson from './revised/hackerman-hooded/sheet.json';
import revisedHoodedPng from './revised/hackerman-hooded/sheet.png';
import revisedStrategyJson from './revised/strategy/sheet.json';
import revisedStrategyPng from './revised/strategy/sheet.png';

/**
 * A hero's design in the Terraria style, drawn by tools/looks/terraria. The
 * development lineup stands the designs beside the game's heroes, whatever
 * look the game is set to, so they are loaded here rather than through the
 * look selection.
 */
export interface TerrariaDesign {
  /** Where its sheet is under art/looks/terraria/, which tells apart two designs of one hero. */
  readonly id: string;
  readonly hero: CharacterId;
  /** What sets it apart from the hero's other design in its set, e.g. `HOOD UP`; `null` if it has none. */
  readonly variant: string | null;
  readonly sheet: ImageSheetSource;
}

/** Every hero's default design, in the heroes' order: the Terraria look's own sheets (characters/<hero>/). */
export const TERRARIA_DESIGNS: readonly TerrariaDesign[] = [
  { id: 'characters/hackerman', hero: 'hackerman', variant: null, sheet: { png: hackermanPng, json: hackermanJson } },
  { id: 'characters/artsy', hero: 'artsy', variant: null, sheet: { png: artsyPng, json: artsyJson } },
  { id: 'characters/strategy', hero: 'strategy', variant: null, sheet: { png: strategyPng, json: strategyJson } },
];

/**
 * The revision drawn beside them to compare (revised/<design>/): new hair,
 * glasses and cap over the same bodies, then the ENGINEER with his hood up.
 * The game never loads it; promoting it would make it the look's own sheets.
 */
export const REVISED_TERRARIA_DESIGNS: readonly TerrariaDesign[] = [
  {
    id: 'revised/hackerman',
    hero: 'hackerman',
    variant: null,
    sheet: { png: revisedHackermanPng, json: revisedHackermanJson },
  },
  { id: 'revised/artsy', hero: 'artsy', variant: null, sheet: { png: revisedArtsyPng, json: revisedArtsyJson } },
  {
    id: 'revised/strategy',
    hero: 'strategy',
    variant: null,
    sheet: { png: revisedStrategyPng, json: revisedStrategyJson },
  },
  {
    id: 'revised/hackerman-hooded',
    hero: 'hackerman',
    variant: 'HOOD UP',
    sheet: { png: revisedHoodedPng, json: revisedHoodedJson },
  },
];

const imageKey = (design: TerrariaDesign): string => `looks/terraria/${design.id}`;

/**
 * Downloads every design, current and revised, into `assets`. The game never
 * does: whoever opens a scene that draws them (the playground, the harness)
 * calls this first, so the scene can read them synchronously.
 */
export async function loadTerrariaDesigns(assets: AssetStore): Promise<void> {
  await Promise.all(
    [...TERRARIA_DESIGNS, ...REVISED_TERRARIA_DESIGNS].map((design) =>
      assets.loadImage(imageKey(design), design.sheet.png),
    ),
  );
}

/** The design's sheet, from the image `loadTerrariaDesigns` stored; the store throws if it never ran. */
export function terrariaDesignSheet(assets: AssetStore, design: TerrariaDesign): SpriteSheet {
  const key = imageKey(design);
  return SpriteSheet.fromImage(assets.image(key), parseSpriteSheetSpec(design.sheet.json, `${key}.json`), key);
}
