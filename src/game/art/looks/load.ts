import { type CharacterId, characters, type SkillId, skills } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec, type SpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { ATTACK_VISUAL_PARTS, type AttackVisual } from '../../entities/shots/AttackVisual';
import { SKILL_VISUAL_PARTS, type SkillVisual } from '../../skills/SkillVisual';
import { CUSTOMER_SHEET, HERO_SHEET, type SheetContract, SKILL_ICON_SHEET, strayHeroAnimations } from './contracts';
import type { LookId } from './ids';
import type { CustomerLook, HeroLook, Looks, SkillLook, SkillLooks } from './Looks';
import type { FxSheets, SheetSource } from './module';
import { type LookRegistry, lookRegistry } from './registry';
import type { LookOffer, LookSelection } from './selection';

const CHARACTER_IDS: readonly CharacterId[] = characters.map((character) => character.id);
const SKILL_IDS = Object.keys(skills) as SkillId[];

/**
 * Loads the art for `selection`: only the selected looks' modules and images
 * are fetched. Classic fills whatever part of a hero's attack or a skill a
 * look leaves out; it is drawn in code, so that costs no download.
 */
export async function loadLooks(
  selection: LookSelection,
  assets: AssetStore,
  registry: LookRegistry = lookRegistry,
): Promise<Looks> {
  const loader = new LookLoader(registry, assets);
  await Promise.all([
    ...CHARACTER_IDS.map((id) => loader.hero(selection.characters[id], id)),
    loader.customer(selection.customer),
    ...SKILL_IDS.map((id) => loader.skill(selection.skills[id], id)),
  ]);
  return loader.assemble(selection);
}

/** Every registered piece of every look, loaded up front to be compared side by side. */
export interface LookLibrary {
  readonly offer: LookOffer;
  /** The art for any selection drawn from `offer`, without loading anything more. */
  looks(selection: LookSelection): Looks;
}

export async function loadLookLibrary(assets: AssetStore, registry: LookRegistry = lookRegistry): Promise<LookLibrary> {
  const loader = new LookLoader(registry, assets);
  const { offer } = registry;
  await Promise.all([
    ...CHARACTER_IDS.flatMap((id) => offer.characters[id].map((lookId) => loader.hero(lookId, id))),
    ...offer.customer.map((lookId) => loader.customer(lookId)),
    ...SKILL_IDS.flatMap((id) => offer.skills[id].map((lookId) => loader.skill(lookId, id))),
  ]);
  return { offer, looks: (selection) => loader.assemble(selection) };
}

/** Loads each piece once, however many selections share it, and remembers it for synchronous assembly. */
class LookLoader {
  readonly #registry: LookRegistry;
  readonly #assets: AssetStore;
  readonly #pending = new Map<string, Promise<unknown>>();
  readonly #loaded = new Map<string, unknown>();

  constructor(registry: LookRegistry, assets: AssetStore) {
    this.#registry = registry;
    this.#assets = assets;
  }

  hero(lookId: LookId, characterId: CharacterId): Promise<HeroLook> {
    return this.#once(heroKey(lookId, characterId), () => this.#loadHero(lookId, characterId));
  }

  customer(lookId: LookId): Promise<CustomerLook> {
    return this.#once(customerKey(lookId), async () => {
      const module = await this.#registry.customer(lookId);
      return { lookId, sheet: await this.#sheet(module.sheet, `looks/${lookId}/customer/sheet`, CUSTOMER_SHEET) };
    });
  }

  skill<K extends SkillId>(lookId: LookId, skillId: K): Promise<SkillLook<K>> {
    return this.#once(skillKey(lookId, skillId), () => this.#loadSkill(lookId, skillId));
  }

  /** The selected pieces, which must already be loaded. */
  assemble(selection: LookSelection): Looks {
    return {
      selection,
      characters: Object.fromEntries(
        CHARACTER_IDS.map((id) => [id, this.#get<HeroLook>(heroKey(selection.characters[id], id))]),
      ) as Record<CharacterId, HeroLook>,
      customer: this.#get<CustomerLook>(customerKey(selection.customer)),
      skills: Object.fromEntries(
        SKILL_IDS.map((id) => [id, this.#get<SkillLook<typeof id>>(skillKey(selection.skills[id], id))]),
      ) as SkillLooks,
    };
  }

  async #loadHero(lookId: LookId, characterId: CharacterId): Promise<HeroLook> {
    const module = await this.#registry.hero(lookId, characterId);
    const where = `looks/${lookId}/characters/${characterId}`;
    const [sheet, fx] = await Promise.all([
      this.#sheet(module.sheet, `${where}/sheet`, HERO_SHEET),
      this.#fx(module.fx, where),
    ]);
    const stray = strayHeroAnimations(sheet.animationNames, characterId);
    if (stray.length > 0) {
      const names = stray.map((animation) => `"${animation}"`).join(', ');
      throw new Error(`${where}/sheet: ${names}: not a hero animation, nor a pose of one of ${characterId}'s skills`);
    }
    const own = module.attack?.(fx) ?? {};
    if (complete(own, ATTACK_VISUAL_PARTS)) return { lookId, sheet, attack: own };
    if (lookId === 'classic') throw new Error(`${where}: classic must draw the whole attack`);
    const classic = await this.hero('classic', characterId);
    return { lookId, sheet, attack: fillIn<AttackVisual>(own, classic.attack, ATTACK_VISUAL_PARTS) };
  }

  async #loadSkill<K extends SkillId>(lookId: LookId, skillId: K): Promise<SkillLook<K>> {
    const module = await this.#registry.skill(lookId, skillId);
    const where = `looks/${lookId}/skills/${skillId}`;
    const fx = await this.#fx(module.fx, where);
    const own: SkillVisual<K> = module.visual?.(fx) ?? {};
    const icon = module.icon && this.#sheet(module.icon, `${where}/icon`, SKILL_ICON_SHEET);
    if (lookId === 'classic') {
      if (!icon) throw new Error(`${where}: classic must have an icon`);
      return { lookId, icon: await icon, visual: own };
    }
    const classic = await this.skill('classic', skillId);
    return {
      lookId,
      icon: icon ? await icon : classic.icon,
      visual: fillIn<SkillVisual<K>>(own, classic.visual, SKILL_VISUAL_PARTS),
    };
  }

  async #fx(sources: Readonly<Record<string, SheetSource>>, where: string): Promise<FxSheets> {
    const entries = await Promise.all(
      Object.entries(sources).map(async ([name, source]) => [name, await this.#sheet(source, `${where}/fx-${name}`)]),
    );
    return Object.fromEntries(entries);
  }

  /** Loads one sheet; `contract` holds image sheets to their kind's animations, frame size and origin. */
  async #sheet<A extends string>(
    source: SheetSource,
    name: string,
    contract?: SheetContract<A>,
  ): Promise<SpriteSheet<A>> {
    let sheet: SpriteSheet<string>;
    if ('png' in source) {
      const spec = parseSpriteSheetSpec(source.json, `${name}.json`);
      if (contract) checkImageContract(spec, contract, `${name}.json`);
      sheet = SpriteSheet.fromImage(await this.#assets.loadImage(name, source.png), spec, name);
    } else {
      sheet = SpriteSheet.compile(source, name);
    }
    if (!contract) return sheet as SpriteSheet<A>;
    if (!sheet.hasAll(contract.animations)) {
      const missing = contract.animations.filter((animation) => !sheet.has(animation));
      throw new Error(`${name}: missing animation ${missing.map((animation) => `"${animation}"`).join(', ')}`);
    }
    return sheet;
  }

  #once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.#pending.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load().then((value) => {
        this.#loaded.set(key, value);
        return value;
      });
      this.#pending.set(key, pending);
    }
    return pending;
  }

  #get<T>(key: string): T {
    if (!this.#loaded.has(key)) throw new Error(`Looks: ${key} was not loaded`);
    // Keys are built by the same functions that stored the value, so the type is the one stored.
    return this.#loaded.get(key) as T;
  }
}

const heroKey = (lookId: LookId, characterId: CharacterId) => `${lookId}/characters/${characterId}`;
const customerKey = (lookId: LookId) => `${lookId}/customer`;
const skillKey = (lookId: LookId, skillId: SkillId) => `${lookId}/skills/${skillId}`;

/** Image sheets must fit the kind's frame and origin, or they would not line up with the other looks. */
function checkImageContract<A extends string>(spec: SpriteSheetSpec, contract: SheetContract<A>, source: string): void {
  const { frame, origin } = contract;
  if (spec.frame.w !== frame.w || spec.frame.h !== frame.h) {
    throw new Error(`${source}: frames must be ${frame.w}×${frame.h}, got ${spec.frame.w}×${spec.frame.h}`);
  }
  if (spec.origin.x !== origin.x || spec.origin.y !== origin.y) {
    throw new Error(
      `${source}: the origin must be (${origin.x}, ${origin.y}), got (${spec.origin.x}, ${spec.origin.y})`,
    );
  }
}

function complete<T extends object>(own: Partial<T>, parts: readonly (keyof T)[]): own is T {
  return parts.every((part) => own[part] !== undefined);
}

/** `own`'s parts where it has them, `base`'s for the rest. */
function fillIn<T extends object>(own: Partial<T>, base: T, parts: readonly (keyof T)[]): T {
  const merged: { -readonly [P in keyof T]: T[P] } = { ...base };
  for (const part of parts) {
    const mine = own[part];
    if (mine !== undefined) merged[part] = mine as T[keyof T];
  }
  return merged;
}
