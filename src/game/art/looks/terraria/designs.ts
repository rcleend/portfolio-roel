import type { CharacterId } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { art as hoodedArt } from '@/game/art/looks/terraria-hooded/characters/hackerman/sheet.art';
import hoodedJson from '@/game/art/looks/terraria-hooded/characters/hackerman/sheet.json';
import { art as revisedArtsyArt } from '@/game/art/looks/terraria-revised/characters/artsy/sheet.art';
import revisedArtsyJson from '@/game/art/looks/terraria-revised/characters/artsy/sheet.json';
import { art as revisedHackermanArt } from '@/game/art/looks/terraria-revised/characters/hackerman/sheet.art';
import revisedHackermanJson from '@/game/art/looks/terraria-revised/characters/hackerman/sheet.json';
import { art as revisedStrategyArt } from '@/game/art/looks/terraria-revised/characters/strategy/sheet.art';
import revisedStrategyJson from '@/game/art/looks/terraria-revised/characters/strategy/sheet.json';
import type { LookId } from '../ids';
import type { ImageSheetSource } from '../module';
import { art as artsyArt } from './characters/artsy/sheet.art';
import artsyJson from './characters/artsy/sheet.json';
import { art as hackermanArt } from './characters/hackerman/sheet.art';
import hackermanJson from './characters/hackerman/sheet.json';
import { art as strategyArt } from './characters/strategy/sheet.art';
import strategyJson from './characters/strategy/sheet.json';

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
    sheet: { art: hackermanArt, json: hackermanJson },
  },
  { look: 'terraria', hero: 'artsy', variant: null, sheet: { art: artsyArt, json: artsyJson } },
  { look: 'terraria', hero: 'strategy', variant: null, sheet: { art: strategyArt, json: strategyJson } },
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
    sheet: { art: revisedHackermanArt, json: revisedHackermanJson },
  },
  {
    look: 'terraria-revised',
    hero: 'artsy',
    variant: null,
    sheet: { art: revisedArtsyArt, json: revisedArtsyJson },
  },
  {
    look: 'terraria-revised',
    hero: 'strategy',
    variant: null,
    sheet: { art: revisedStrategyArt, json: revisedStrategyJson },
  },
  {
    look: 'terraria-hooded',
    hero: 'hackerman',
    variant: 'HOOD UP',
    sheet: { art: hoodedArt, json: hoodedJson },
  },
];

const imageKey = (design: TerrariaDesign): string => `looks/${design.look}/${design.hero}`;

/**
 * Decodes every design, current and revised, into `assets`. The game never
 * does: whoever opens a scene that draws them (the harness) calls this
 * first, so the scene can read them synchronously.
 */
export async function loadTerrariaDesigns(assets: AssetStore): Promise<void> {
  for (const design of [...TERRARIA_DESIGNS, ...REVISED_TERRARIA_DESIGNS]) {
    assets.addImage(imageKey(design), design.sheet.art);
  }
}

/** The design's sheet, from the image `loadTerrariaDesigns` decoded; the store throws if it never ran. */
export function terrariaDesignSheet(assets: AssetStore, design: TerrariaDesign): SpriteSheet {
  const key = imageKey(design);
  return SpriteSheet.fromImage(assets.image(key), parseSpriteSheetSpec(design.sheet.json, `${key}.json`), key);
}
