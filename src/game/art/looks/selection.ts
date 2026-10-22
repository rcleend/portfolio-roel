import { type CharacterId, characters, type SkillId, skills } from '@/content';
import { isLookId, LOOK_IDS, type LookId } from './ids';

/** Which look each hero, the customer and each skill is drawn in. */
export interface LookSelection {
  readonly characters: Readonly<Record<CharacterId, LookId>>;
  readonly customer: LookId;
  readonly skills: Readonly<Record<SkillId, LookId>>;
}

/**
 * The looks the game ships with. Promoting one of the captain's picks is a
 * one-line change here.
 */
export const DEFAULT_LOOKS: LookSelection = {
  characters: {
    hackerman: 'classic',
    artsy: 'classic',
    strategy: 'classic',
  },
  customer: 'classic',
  skills: {
    'full-stack-attack': 'classic',
    'agent-summon': 'classic',
    'ux-elixir': 'classic',
    'power-chord': 'classic',
    'north-star': 'classic',
    'churn-shield': 'classic',
  },
};

/** A partial selection, e.g. from `?looks=`; whatever it leaves out comes from `DEFAULT_LOOKS`. */
export interface LookSelectionInput {
  readonly characters?: Readonly<Partial<Record<CharacterId, LookId>>>;
  readonly customer?: LookId;
  readonly skills?: Readonly<Partial<Record<SkillId, LookId>>>;
}

/** The looks that exist for each piece. A look may cover only some pieces, so this is all a selection can offer. */
export interface LookOffer {
  readonly characters: Readonly<Record<CharacterId, readonly LookId[]>>;
  readonly customer: readonly LookId[];
  readonly skills: Readonly<Record<SkillId, readonly LookId[]>>;
}

export class LookSelectionError extends Error {
  override readonly name = 'LookSelectionError';
}

const CHARACTER_IDS = characters.map((character) => character.id);
const SKILL_IDS = Object.keys(skills) as SkillId[];
const SECTIONS = ['characters', 'customer', 'skills'] as const;

/**
 * Reads untrusted JSON — the harness's `?looks=` — as a partial selection,
 * e.g. `{"characters":{"hackerman":"arcade"},"customer":"hibit","skills":{"power-chord":"portrait"}}`.
 * Anything unknown throws, naming what would have been accepted.
 */
export function parseLookSelection(raw: unknown): LookSelectionInput {
  const json = record(raw) ?? fail('looks', `must be an object like {"characters":{"hackerman":"arcade"}}`, raw);
  for (const key of Object.keys(json)) {
    if (!(SECTIONS as readonly string[]).includes(key)) {
      throw new LookSelectionError(`looks: unknown key "${key}" (expected ${SECTIONS.join(', ')})`);
    }
  }
  return {
    ...(json.characters === undefined ? {} : { characters: lookMap(json.characters, 'characters', CHARACTER_IDS) }),
    ...(json.customer === undefined ? {} : { customer: lookId(json.customer, 'looks.customer') }),
    ...(json.skills === undefined ? {} : { skills: lookMap(json.skills, 'skills', SKILL_IDS) }),
  };
}

/** Completes `input` with the defaults, and refuses any piece that `offer` does not have. */
export function resolveLooks(input: LookSelectionInput, offer: LookOffer): LookSelection {
  const pick = (path: string, wanted: LookId, available: readonly LookId[]): LookId => {
    if (available.includes(wanted)) return wanted;
    const listed = available.length > 0 ? available.join(', ') : 'none';
    throw new LookSelectionError(`${path}: the "${wanted}" look has not drawn this yet (available: ${listed})`);
  };
  return {
    characters: Object.fromEntries(
      CHARACTER_IDS.map((id) => [
        id,
        pick(`looks.characters.${id}`, input.characters?.[id] ?? DEFAULT_LOOKS.characters[id], offer.characters[id]),
      ]),
    ) as Record<CharacterId, LookId>,
    customer: pick('looks.customer', input.customer ?? DEFAULT_LOOKS.customer, offer.customer),
    skills: Object.fromEntries(
      SKILL_IDS.map((id) => [
        id,
        pick(`looks.skills.${id}`, input.skills?.[id] ?? DEFAULT_LOOKS.skills[id], offer.skills[id]),
      ]),
    ) as Record<SkillId, LookId>,
  };
}

function lookMap<K extends string>(raw: unknown, section: string, ids: readonly K[]): Partial<Record<K, LookId>> {
  const json = record(raw) ?? fail(`looks.${section}`, `must map ids to looks, like {"${ids[0]}":"arcade"}`, raw);
  const map: Partial<Record<K, LookId>> = {};
  for (const [id, value] of Object.entries(json)) {
    if (!(ids as readonly string[]).includes(id)) {
      throw new LookSelectionError(`looks.${section}: unknown id "${id}" (expected ${ids.join(', ')})`);
    }
    map[id as K] = lookId(value, `looks.${section}.${id}`);
  }
  return map;
}

function lookId(value: unknown, path: string): LookId {
  return isLookId(value) ? value : fail(path, `must be one of ${LOOK_IDS.join(', ')}`, value);
}

function fail(path: string, message: string, got: unknown): never {
  throw new LookSelectionError(`${path} ${message}, got ${JSON.stringify(got) ?? 'nothing'}`);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
