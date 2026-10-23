import { describe, expect, it } from 'vitest';
import { characters, skills } from '@/content';
import { mostFrustrated } from '../entities/shots/HomingStar';
import { TileGrid } from '../world/grid';
import { SKILLS } from './index';
import { FakeSkillWorld } from './testing';

describe('skills', () => {
  it('implements every skill the characters can use, with its own sound', () => {
    for (const character of characters) {
      for (const id of character.skills) {
        expect(SKILLS[id].id).toBe(id);
        expect(SKILLS[id].sfx).toMatch(/^skill-/);
      }
    }
    expect(Object.keys(SKILLS).sort()).toEqual(Object.keys(skills).sort());
  });

  describe('FULL-STACK ATTACK', () => {
    it('pierces every customer in line once, and nobody behind or above', () => {
      const world = new FakeSkillWorld();
      const ahead = world.addCustomer(180);
      const further = world.addCustomer(260);
      const behind = world.addCustomer(40);
      const above = world.addCustomer(200, 120);
      const beam = SKILLS['full-stack-attack'].cast(world);
      world.run(beam, 1);
      expect(beam.done).toBe(true);
      expect(world.hits.map((hit) => hit.target)).toEqual([ahead, further]);
      expect(world.hits.every((hit) => hit.direction === 1)).toBe(true);
      expect(world.customers.includes(behind) && world.customers.includes(above)).toBe(true);
      expect(world.popped.length).toBeGreaterThan(0);
    });
  });

  describe('AGENT SUMMON', () => {
    it('fires at customers on screen for eight seconds, then leaves', () => {
      const world = new FakeSkillWorld();
      world.addCustomer(200, 200, 99);
      const drone = SKILLS['agent-summon'].cast(world);
      world.run(drone, 3);
      expect(world.shots.length).toBeGreaterThanOrEqual(4);
      world.run(drone, 6);
      expect(drone.done).toBe(true);
    });

    it('holds fire when nobody is in range', () => {
      const world = new FakeSkillWorld();
      world.addCustomer(900);
      world.run(SKILLS['agent-summon'].cast(world), 3);
      expect(world.shots).toEqual([]);
    });
  });

  describe('UX ELIXIR', () => {
    it('calms, slows and makes hits decisive for six seconds', () => {
      const world = new FakeSkillWorld();
      const elixir = SKILLS['ux-elixir'].cast(world);
      expect(elixir.modifiers).toEqual({ customerSpeed: 0.35, customersCalm: true, decisiveHits: true });
      world.run(elixir, 5.9);
      expect(elixir.done).toBe(false);
      world.run(elixir, 0.2);
      expect(elixir.done).toBe(true);
    });
  });

  describe('POWER CHORD', () => {
    it('stuns every customer on screen for three seconds and clears the bubbles', () => {
      const world = new FakeSkillWorld();
      const near = world.addCustomer(150);
      const far = world.addCustomer(310);
      world.addCustomer(700);
      SKILLS['power-chord'].cast(world);
      expect(world.stuns).toEqual([
        { target: near, seconds: 3 },
        { target: far, seconds: 3 },
      ]);
      expect(world.popped).toEqual([world.view]);
      expect(world.shakes).toBe(1);
    });
  });

  describe('NORTH STAR', () => {
    it('launches a star that homes in on the most frustrated customer', () => {
      const world = new FakeSkillWorld();
      world.addCustomer(60, 200, 1);
      const angriest = world.addCustomer(260, 200, 3);
      expect(mostFrustrated(world.targets())).toBe(angriest);
      SKILLS['north-star'].cast(world);
      const [star] = world.shots;
      expect(star).toBeDefined();
      if (!star) return;
      const grid = new TileGrid(40, 15, 8);
      const center = { x: angriest.rect.x + 7, y: angriest.rect.y + 14 };
      let closest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 120 && star.alive; i++) {
        star.update(1 / 60, { grid, targets: world.targets() });
        closest = Math.min(closest, Math.hypot(star.x - center.x, star.y - center.y));
      }
      expect(closest).toBeLessThan(6);
    });
  });

  describe('CHURN SHIELD', () => {
    it('blocks damage for five seconds and calms customers who bump into it', () => {
      const world = new FakeSkillWorld();
      const bumper = world.addCustomer(112, 200, 9);
      world.addCustomer(200, 200, 9);
      const shield = SKILLS['churn-shield'].cast(world);
      expect(shield.modifiers.playerShielded).toBe(true);
      world.run(shield, 1);
      expect(world.hits.every((hit) => hit.target === bumper && hit.direction === 1)).toBe(true);
      expect(world.hits).toHaveLength(2);
      world.run(shield, 4.1);
      expect(shield.done).toBe(true);
    });
  });
});
