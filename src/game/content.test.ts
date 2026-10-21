import { describe, expect, it } from 'vitest';
import { characters, experience, getExperience, levels, type SkillId, skills } from '@/content';
import { validatePixelArt } from '@/engine/gfx/PixelArt';
import { characterSheets, skillIconSheets, unhappyCustomerSheet } from './art';
import { CHARACTER_ANIMATIONS } from './art/characters/rig';
import { CUSTOMER_ANIMATIONS } from './art/enemies/unhappy-customer';

const skillIds = Object.keys(skills) as SkillId[];

/** Content and art must agree: these tests catch a renamed id before a player does. */
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

describe('shared art', () => {
  it('has a valid sheet with every contract animation for each character', () => {
    for (const character of characters) {
      const sheet = characterSheets[character.id];
      expect(() => validatePixelArt(sheet, character.id)).not.toThrow();
      expect(sheet.size).toEqual({ w: 32, h: 40 });
      expect(Object.keys(sheet.animations).sort()).toEqual([...CHARACTER_ANIMATIONS].sort());
    }
  });

  it('has a valid unhappy customer sheet with every contract animation', () => {
    expect(() => validatePixelArt(unhappyCustomerSheet, 'unhappy-customer')).not.toThrow();
    expect(unhappyCustomerSheet.size).toEqual({ w: 32, h: 40 });
    expect(Object.keys(unhappyCustomerSheet.animations).sort()).toEqual([...CUSTOMER_ANIMATIONS].sort());
  });

  it('has a valid 16 × 16 icon sheet for every skill', () => {
    expect(Object.keys(skillIconSheets).sort()).toEqual([...skillIds].sort());
    for (const id of skillIds) {
      const sheet = skillIconSheets[id];
      expect(() => validatePixelArt(sheet, id)).not.toThrow();
      expect(sheet.size).toEqual({ w: 16, h: 16 });
      expect(sheet.animations.idle).toBeDefined();
    }
  });
});
