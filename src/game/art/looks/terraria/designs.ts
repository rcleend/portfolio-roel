import type { CharacterId } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import hoodedJson from '@/game/art/looks/terraria-hooded/characters/hackerman/sheet.json';
import hoodedPng from '@/game/art/looks/terraria-hooded/characters/hackerman/sheet.png';
import revisedArtsyJson from '@/game/art/looks/terraria-revised/characters/artsy/sheet.json';
import revisedArtsyPng from '@/game/art/looks/terraria-revised/characters/artsy/sheet.png';
import revisedHackermanJson from '@/game/art/looks/terraria-revised/characters/hackerman/sheet.json';
import revisedHackermanPng from '@/game/art/looks/terraria-revised/characters/hackerman/sheet.png';
import revisedStrategyJson from '@/game/art/looks/terraria-revised/characters/strategy/sheet.json';
import revisedStrategyPng from '@/game/art/looks/terraria-revised/characters/strategy/sheet.png';
import type { LookId } from '../ids';
import type { ImageSheetSource } from '../module';
import artsyJson from './characters/artsy/sheet.json';
import artsyPng from './characters/artsy/sheet.png';
import hackermanJson from './characters/hackerman/sheet.json';
import hackermanPng from './characters/hackerman/sheet.png';
import strategyJson from './characters/strategy/sheet.json';
import strategyPng from './characters/strategy/sheet.png';

/**
 * A hero's design in the Terraria style, drawn by tools/looks/terraria: the
 * sheet one of the Terraria looks plays for him. The development lineup
 * stands the designs beside the game's heroes, whatever look the game is set
 * to, so they are loaded here rather than through the look selection.
 */
export interface TerrariaDesign {
  /** The look that plays it, which tells apart two designs of one hero. */
  readonly look: LookId;
  readonly hero: CharacterId;
  /** What sets it apart from the hero's other design in its set, e.g. `HOOD UP`; `null` if it has none. */
  readonly variant: string | null;
  readonly sheet: ImageSheetSource;
}

/** Every hero's default design, in the heroes' order: the Terraria look's own sheets. */
export const TERRARIA_DESIGNS: readonly TerrariaDesign[] = [
  {
    look: 'terraria',
    hero: 'hackerman',
    variant: null,
    sheet: { png: hackermanPng, json: hackermanJson },
  },
  { look: 'terraria', hero: 'artsy', variant: null, sheet: { png: artsyPng, json: artsyJson } },
  { look: 'terraria', hero: 'strategy', variant: null, sheet: { png: strategyPng, json: strategyJson } },
];

/**
 * The revision beside them to compare, the sheets its looks play: new hair,
 * glasses and cap over the same bodies (`terraria-revised`), then the
 * ENGINEER with his hood up (`terraria-hooded`). The game ships neither;
 * promoting one would make its sheets the Terraria look's own.
 */
export const REVISED_TERRARIA_DESIGNS: readonly TerrariaDesign[] = [
  {
    look: 'terraria-revised',
    hero: 'hackerman',
    variant: null,
    sheet: { png: revisedHackermanPng, json: revisedHackermanJson },
  },
  {
    look: 'terraria-revised',
    hero: 'artsy',
    variant: null,
    sheet: { png: revisedArtsyPng, json: revisedArtsyJson },
  },
  {
    look: 'terraria-revised',
    hero: 'strategy',
    variant: null,
    sheet: { png: revisedStrategyPng, json: revisedStrategyJson },
  },
  {
    look: 'terraria-hooded',
    hero: 'hackerman',
    variant: 'HOOD UP',
    sheet: { png: hoodedPng, json: hoodedJson },
  },
];

const imageKey = (design: TerrariaDesign): string => `looks/${design.look}/${design.hero}`;

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
