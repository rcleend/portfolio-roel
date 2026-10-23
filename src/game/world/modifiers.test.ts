import { describe, expect, it } from 'vitest';
import type { ActiveSkill, SkillModifiers } from '../skills/Skill';
import { combineModifiers, NEUTRAL_MODIFIERS } from './modifiers';

const running = (modifiers: SkillModifiers): ActiveSkill => ({
  done: false,
  modifiers,
  update: () => {},
  render: () => {},
});

describe('combineModifiers', () => {
  it('is neutral without running skills', () => {
    expect(combineModifiers([])).toEqual(NEUTRAL_MODIFIERS);
  });

  it('multiplies speeds and ORs every flag', () => {
    expect(
      combineModifiers([
        running({ customerSpeed: 0.5, customersCalm: true }),
        running({ customerSpeed: 0.5, playerShielded: true }),
        running({ decisiveHits: true }),
      ]),
    ).toEqual({ customerSpeed: 0.25, customersCalm: true, decisiveHits: true, playerShielded: true });
  });
});
