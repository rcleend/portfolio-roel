import { type CharacterId, characters, type LevelId, levels, type SkillId, skills } from '@/content';
import type { ShowcaseParams } from '../params';
import { CUSTOMER_DEMO, MOVES_DEMO, type ShowcaseDemo, skillDemo } from './demos';

/** What the showcase plays, resolved from its params. */
export interface Showcase {
  readonly demo: ShowcaseDemo;
  readonly hero: CharacterId;
  readonly levelId: LevelId;
}

export class ShowcaseParamsError extends Error {
  override readonly name = 'ShowcaseParamsError';
}

const DEMOS = ['moves', 'skill', 'customer'] as const;

/**
 * Reads the showcase's params, which arrive as untrusted JSON from the
 * harness. Anything unknown throws, naming what would have been accepted, so
 * a typo fails a screenshot instead of showing the wrong demo.
 */
export function resolveShowcase(params: ShowcaseParams | undefined): Showcase {
  const raw: Record<string, unknown> = { ...params };
  const demo = oneOf(raw.demo ?? 'moves', 'demo', DEMOS);
  const hero =
    raw.hero === undefined
      ? null
      : oneOf(
          raw.hero,
          'hero',
          characters.map((character) => character.id),
        );
  const levelId = oneOf(
    raw.levelId ?? 'scripe',
    'levelId',
    levels.map((level) => level.id),
  );
  if (demo !== 'skill')
    return { demo: demo === 'moves' ? MOVES_DEMO : CUSTOMER_DEMO, hero: hero ?? 'hackerman', levelId };

  const skill = oneOf(raw.skill, 'skill', Object.keys(skills) as SkillId[]);
  const owner = characters.find((character) => character.skills.includes(skill));
  if (!owner) throw new ShowcaseParamsError(`showcase: nobody casts "${skill}"`);
  if (hero !== null && hero !== owner.id) {
    throw new ShowcaseParamsError(`showcase: "${skill}" is ${owner.id}'s skill, not ${hero}'s`);
  }
  return { demo: skillDemo(owner.id, skill), hero: owner.id, levelId };
}

function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new ShowcaseParamsError(
    `showcase: ${name} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value) ?? 'nothing'}`,
  );
}
