import { describe, expect, it } from 'vitest';
import { characters, experience, getExperience, levels, type SkillId, skills } from '@/content';

const skillIds = Object.keys(skills) as SkillId[];

/** Content must agree with itself: these tests catch a renamed id before a player does. */
describe('content integrity', () => {
  it('gives every character two distinct, existing skills', () => {
    for (const character of characters) {
      expect(character.skills).toHaveLength(2);
      expect(new Set(character.skills).size).toBe(2);
      for (const id of character.skills) expect(skillIds).toContain(id);
    }
  });

  it('uses every skill exactly once across characters', () => {
    expect(characters.flatMap((character) => character.skills).sort()).toEqual([...skillIds].sort());
  });

  it('keys every skill by its own id', () => {
    for (const [id, skill] of Object.entries(skills)) expect(skill.id).toBe(id);
  });

  it('points every level at an existing experience and gives it complaints', () => {
    const experienceIds = experience.map((entry) => entry.id);
    for (const level of levels) {
      expect(experienceIds).toContain(level.experienceId);
      expect(() => getExperience(level.experienceId)).not.toThrow();
      expect(level.complaints.length).toBeGreaterThan(0);
    }
  });

  it('has unique highlight ids', () => {
    const ids = experience.flatMap((entry) => entry.highlights.map((highlight) => highlight.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
