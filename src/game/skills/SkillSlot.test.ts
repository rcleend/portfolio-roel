import { describe, expect, it } from 'vitest';
import { skills } from '@/content';
import { NO_MODIFIERS, type Skill, type SkillWorld } from './Skill';
import { SkillSlot } from './SkillSlot';

const casts: string[] = [];
const fakeSkill: Skill = {
  id: 'north-star',
  sfx: 'skill-north-star',
  cast: () => {
    casts.push('cast');
    return { done: true, modifiers: NO_MODIFIERS, update: () => {}, render: () => {} };
  },
};
const world = {} as SkillWorld;

describe('SkillSlot', () => {
  it('casts when ready, then refuses until the cooldown has elapsed', () => {
    casts.length = 0;
    const slot = new SkillSlot(fakeSkill, 7);
    expect(slot.ready).toBe(true);
    expect(slot.tryCast(world)).not.toBeNull();
    expect(slot.ready).toBe(false);
    expect(slot.tryCast(world)).toBeNull();
    for (let i = 0; i < 60 * 6; i++) slot.update(1 / 60);
    expect(slot.remaining).toBeCloseTo(1, 5);
    expect(slot.tryCast(world)).toBeNull();
    for (let i = 0; i < 61; i++) slot.update(1 / 60);
    expect(slot.ready).toBe(true);
    expect(slot.tryCast(world)).not.toBeNull();
    expect(casts).toEqual(['cast', 'cast']);
  });

  it('reports charge from 0 (just cast) to 1 (ready)', () => {
    const slot = new SkillSlot(fakeSkill, 10);
    expect(slot.charge).toBe(1);
    slot.tryCast(world);
    expect(slot.charge).toBe(0);
    for (let i = 0; i < 300; i++) slot.update(1 / 60);
    expect(slot.charge).toBeCloseTo(0.5, 5);
  });

  it('uses the cooldowns from the content', () => {
    for (const skill of Object.values(skills)) {
      const slot = new SkillSlot(fakeSkill, skill.cooldownSeconds);
      expect(slot.cooldown).toBe(skill.cooldownSeconds);
    }
    expect(() => new SkillSlot(fakeSkill, -1)).toThrow(RangeError);
  });
});
