import { type CharacterId, characters, type SkillId, skills } from '@/content';
import { LOOK_IDS, type LookId } from './ids';
import type { CustomerLookModule, HeroLookModule, SkillLookModule } from './module';
import type { LookOffer } from './selection';

type Importer = () => Promise<unknown>;

/** Index modules by path relative to this folder, as `import.meta.glob` returns them. */
export interface LookModuleFiles {
  readonly heroes: Readonly<Record<string, Importer>>;
  readonly customers: Readonly<Record<string, Importer>>;
  readonly skills: Readonly<Record<string, Importer>>;
}

/** Every piece of every look, found by its folder and imported only when asked for. */
export interface LookRegistry {
  readonly offer: LookOffer;
  hero(lookId: LookId, characterId: CharacterId): Promise<HeroLookModule>;
  customer(lookId: LookId): Promise<CustomerLookModule>;
  skill<K extends SkillId>(lookId: LookId, skillId: K): Promise<SkillLookModule<K>>;
}

export class LookRegistryError extends Error {
  override readonly name = 'LookRegistryError';
}

const CHARACTER_IDS: readonly CharacterId[] = characters.map((character) => character.id);
const SKILL_IDS = Object.keys(skills) as SkillId[];

const HERO_PATH = /^\.\/([^/]+)\/characters\/([^/]+)\/index\.ts$/;
const CUSTOMER_PATH = /^\.\/([^/]+)\/customer\/index\.ts$/;
const SKILL_PATH = /^\.\/([^/]+)\/skills\/([^/]+)\/index\.ts$/;

/**
 * Builds the registry from index-module paths (`./<lookId>/characters/<characterId>/index.ts`,
 * `./<lookId>/customer/index.ts`, `./<lookId>/skills/<skillId>/index.ts`). A folder named
 * after an unknown look, hero or skill throws at once, naming the expected
 * ones; a module is checked when it is first imported.
 */
export function createLookRegistry(files: LookModuleFiles): LookRegistry {
  const heroes = new Map<string, Importer>();
  const customers = new Map<LookId, Importer>();
  const pieces = new Map<string, Importer>();
  const offer = {
    characters: Object.fromEntries(CHARACTER_IDS.map((id) => [id, [] as LookId[]])) as Record<CharacterId, LookId[]>,
    customer: [] as LookId[],
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, [] as LookId[]])) as Record<SkillId, LookId[]>,
  };

  for (const [path, load] of Object.entries(files.heroes)) {
    const [, look, id] = match(path, HERO_PATH, 'looks/<lookId>/characters/<characterId>/index.ts');
    const lookId = known(path, look, 'look', LOOK_IDS);
    const characterId = known(path, id, 'hero', CHARACTER_IDS);
    heroes.set(`${lookId}/${characterId}`, load);
    offer.characters[characterId].push(lookId);
  }
  for (const [path, load] of Object.entries(files.customers)) {
    const [, look] = match(path, CUSTOMER_PATH, 'looks/<lookId>/customer/index.ts');
    const lookId = known(path, look, 'look', LOOK_IDS);
    customers.set(lookId, load);
    offer.customer.push(lookId);
  }
  for (const [path, load] of Object.entries(files.skills)) {
    const [, look, id] = match(path, SKILL_PATH, 'looks/<lookId>/skills/<skillId>/index.ts');
    const lookId = known(path, look, 'look', LOOK_IDS);
    const skillId = known(path, id, 'skill', SKILL_IDS);
    pieces.set(`${lookId}/${skillId}`, load);
    offer.skills[skillId].push(lookId);
  }

  // List looks in their canonical order, whatever order the bundler found the folders in.
  const ordered = (ids: LookId[]): readonly LookId[] => LOOK_IDS.filter((id) => ids.includes(id));
  const sorted: LookOffer = {
    characters: Object.fromEntries(CHARACTER_IDS.map((id) => [id, ordered(offer.characters[id])])) as Record<
      CharacterId,
      readonly LookId[]
    >,
    customer: ordered(offer.customer),
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, ordered(offer.skills[id])])) as Record<
      SkillId,
      readonly LookId[]
    >,
  };

  return {
    offer: sorted,
    async hero(lookId, characterId) {
      const where = `looks/${lookId}/characters/${characterId}/index.ts`;
      const look = await importLook(heroes.get(`${lookId}/${characterId}`), where);
      if (look.kind !== 'hero' || look.characterId !== characterId) {
        throw new LookRegistryError(`${where} must export \`look = defineHeroLook('${characterId}', …)\``);
      }
      return look as unknown as HeroLookModule;
    },
    async customer(lookId) {
      const where = `looks/${lookId}/customer/index.ts`;
      const look = await importLook(customers.get(lookId), where);
      if (look.kind !== 'customer')
        throw new LookRegistryError(`${where} must export \`look = defineCustomerLook(…)\``);
      return look as unknown as CustomerLookModule;
    },
    async skill<K extends SkillId>(lookId: LookId, skillId: K) {
      const where = `looks/${lookId}/skills/${skillId}/index.ts`;
      const look = await importLook(pieces.get(`${lookId}/${skillId}`), where);
      if (look.kind !== 'skill' || look.skillId !== skillId) {
        throw new LookRegistryError(`${where} must export \`look = defineSkillLook('${skillId}', …)\``);
      }
      return look as unknown as SkillLookModule<K>;
    },
  };
}

function match(path: string, pattern: RegExp, expected: string): RegExpExecArray {
  const found = pattern.exec(path);
  if (!found) throw new LookRegistryError(`Look registry: ${path} is not laid out as ${expected}`);
  return found;
}

function known<T extends string>(path: string, value: string | undefined, what: string, ids: readonly T[]): T {
  if (value !== undefined && (ids as readonly string[]).includes(value)) return value as T;
  throw new LookRegistryError(
    `Look registry: ${path.replace(/^\.\//, 'looks/')} is in a folder for an unknown ${what} "${value}" ` +
      `(expected ${ids.join(', ')})`,
  );
}

async function importLook(load: Importer | undefined, where: string): Promise<Record<string, unknown>> {
  if (!load) throw new LookRegistryError(`${where} is not registered`);
  const module = await load();
  const look = isRecord(module) ? module.look : undefined;
  if (!isRecord(look)) throw new LookRegistryError(`${where} must export \`look\` (see docs/LOOKS.md)`);
  return look;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Bundled by Vite: every look piece is its own chunk, fetched together with its images only once selected. */
export const lookRegistry: LookRegistry = createLookRegistry({
  heroes: import.meta.glob('./*/characters/*/index.ts'),
  customers: import.meta.glob('./*/customer/index.ts'),
  skills: import.meta.glob('./*/skills/*/index.ts'),
});
