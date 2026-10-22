import type { CharacterId, SkillId } from '@/content';
import type { PixelArtSheet } from '@/engine/gfx/PixelArt';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { AttackVisual } from '../../entities/shots/AttackVisual';
import type { SkillVisual } from '../../skills/SkillVisual';

/**
 * What a look folder's index modules export (docs/LOOKS.md). Each piece of a
 * look is one folder whose `index.ts` exports `look`, built with one of the
 * `define…` helpers below; the registry finds it by its path, so adding a
 * piece never touches a shared file.
 */

/**
 * A PNG + JSON sheet, imported by the index module: `import png from
 * './sheet.png'` gives the URL Vite serves, `import json from './sheet.json'`
 * the data. The PNG is fetched only once the look is selected.
 */
export interface ImageSheetSource {
  readonly png: string;
  readonly json: unknown;
}

/** A sheet as a look ships it: a PNG + JSON pair, or pixel art in code (classic). */
export type SheetSource = ImageSheetSource | PixelArtSheet;

/** A look's effect sheets once loaded, by the names its module gave them. */
export type FxSheets<F extends string = string> = Readonly<Record<F, SpriteSheet>>;

/** `looks/<lookId>/characters/<characterId>/index.ts` */
export interface HeroLookModule {
  readonly kind: 'hero';
  readonly characterId: CharacterId;
  /** The eight hero animations (`HERO_SHEET`). */
  readonly sheet: SheetSource;
  /** Extra sheets for the attack visual, e.g. `{ attack: { png, json } }`. */
  readonly fx: Readonly<Record<string, SheetSource>>;
  /** Builds the basic attack's visual from the loaded `fx`; whatever it leaves out, classic draws. */
  readonly attack: ((fx: FxSheets) => Partial<AttackVisual>) | null;
}

/** `looks/<lookId>/customer/index.ts` */
export interface CustomerLookModule {
  readonly kind: 'customer';
  /** The five customer animations (`CUSTOMER_SHEET`). */
  readonly sheet: SheetSource;
}

/** `looks/<lookId>/skills/<skillId>/index.ts` */
export interface SkillLookModule<K extends SkillId> {
  readonly kind: 'skill';
  readonly skillId: K;
  /** The `idle` icon (`SKILL_ICON_SHEET`); classic's when left out. */
  readonly icon: SheetSource | null;
  /** Effect strips for the visual, e.g. `{ wave: { png, json } }`. */
  readonly fx: Readonly<Record<string, SheetSource>>;
  /** Builds the skill's visual from the loaded `fx`; whatever it leaves out, classic draws. */
  readonly visual: ((fx: FxSheets) => SkillVisual<K>) | null;
}

/**
 * Declares a hero look. `attack` receives the `fx` sheets loaded, typed by
 * the names given to them:
 *
 *     export const look = defineHeroLook('hackerman', {
 *       sheet: { png: sheetPng, json: sheetJson },
 *       fx: { attack: { png: attackPng, json: attackJson } },
 *       attack: (fx) => spriteAttack(fx.attack),
 *     });
 */
export function defineHeroLook<F extends string = never>(
  characterId: CharacterId,
  look: {
    readonly sheet: SheetSource;
    readonly fx?: Readonly<Record<F, SheetSource>>;
    readonly attack?: (fx: FxSheets<F>) => Partial<AttackVisual>;
  },
): HeroLookModule {
  return {
    kind: 'hero',
    characterId,
    sheet: look.sheet,
    fx: look.fx ?? {},
    // The loader hands `attack` exactly the sheets declared in `fx`, so its narrower parameter holds.
    attack: (look.attack as ((fx: FxSheets) => Partial<AttackVisual>) | undefined) ?? null,
  };
}

/** Declares the customer's look: `export const look = defineCustomerLook({ sheet: { png, json } })`. */
export function defineCustomerLook(look: { readonly sheet: SheetSource }): CustomerLookModule {
  return { kind: 'customer', sheet: look.sheet };
}

/**
 * Declares a skill look. `visual` receives the `fx` sheets loaded, and its
 * functions receive the skill's own typed state (`SkillVisualTypes`):
 *
 *     export const look = defineSkillLook('power-chord', {
 *       icon: { png: iconPng, json: iconJson },
 *       fx: { wave: { png: wavePng, json: waveJson } },
 *       visual: (fx) => ({
 *         active: (gfx, state, caster, layer) => { … fx.wave … },
 *       }),
 *     });
 */
export function defineSkillLook<K extends SkillId, F extends string = never>(
  skillId: K,
  look: {
    readonly icon?: SheetSource;
    readonly fx?: Readonly<Record<F, SheetSource>>;
    readonly visual?: (fx: FxSheets<F>) => SkillVisual<K>;
  },
): SkillLookModule<K> {
  return {
    kind: 'skill',
    skillId,
    icon: look.icon ?? null,
    fx: look.fx ?? {},
    // As for heroes: the loader passes exactly the declared `fx`.
    visual: (look.visual as ((fx: FxSheets) => SkillVisual<K>) | undefined) ?? null,
  };
}
