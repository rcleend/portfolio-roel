import { describe, expect, it } from 'vitest';
import { IDLE_INTENT } from '../entities/player/Player';
import { FakeSkillWorld } from '../skills/testing';
import { Loadout } from './Loadout';

const HAND = { x: 0, y: 0, facing: 1 } as const;

describe('Loadout', () => {
  it('fires the primary attack at its own rate while held', () => {
    const loadout = new Loadout('hackerman');
    const world = new FakeSkillWorld();
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      if (loadout.step({ ...IDLE_INTENT, attackHeld: true }, 1 / 60, true, HAND, world).shot) shots++;
    }
    expect(shots).toBe(Math.ceil(1 / loadout.attack.cooldown));
  });

  it('casts each skill once per cooldown and nothing while it cannot act', () => {
    const loadout = new Loadout('strategy');
    const world = new FakeSkillWorld();
    const press = { ...IDLE_INTENT, skill1Pressed: true, skill2Pressed: true };
    expect(loadout.step(press, 1 / 60, false, HAND, world).casts).toEqual([]);
    expect(loadout.step(press, 1 / 60, true, HAND, world).casts.map((cast) => cast.slot.skill.id)).toEqual([
      'north-star',
      'churn-shield',
    ]);
    expect(loadout.step(press, 1 / 60, true, HAND, world).casts).toEqual([]);
  });
});
