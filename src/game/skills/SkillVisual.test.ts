import { describe, expect, it } from 'vitest';
import type { SkillId } from '@/content';
import { Rng } from '@/engine/math/Rng';
import { BURSTS, Burst } from '../entities/effects/Burst';
import { type Effect, LOOK_EFFECT_SECONDS } from '../entities/effects/Effect';
import { SkillEffect } from '../entities/effects/SkillEffect';
import { HomingStar } from '../entities/shots/HomingStar';
import { TileGrid } from '../world/grid';
import { SKILLS } from './index';
import type { SkillEnded, SkillVisualTypes } from './SkillVisual';
import { FakeSkillWorld } from './testing';
import { runningElixir } from './uxElixir';

type Fx<K extends SkillId> = SkillVisualTypes[K]['fx'];

/** The `fx` of every effect `skillId` left, in the order it left them. */
function fxOf<K extends SkillId>(world: FakeSkillWorld, skillId: K): Fx<K>[] {
  return world.effects
    .filter((effect): effect is SkillEffect<K> => effect instanceof SkillEffect && effect.skillId === skillId)
    .map((effect) => effect.fx);
}

function rolesOf(world: FakeSkillWorld, skillId: SkillId): string[] {
  return fxOf(world, skillId).map((fx) => fx.role);
}

/** The one end beat `skillId` left; the test fails if there is not exactly one. */
function endedOf<K extends SkillId>(world: FakeSkillWorld, skillId: K): Extract<Fx<K>, SkillEnded<unknown>> {
  const ended = fxOf(world, skillId).filter((fx): fx is Extract<Fx<K>, SkillEnded<unknown>> => fx.role === 'ended');
  expect(ended).toHaveLength(1);
  const [only] = ended;
  if (!only) throw new Error(`${skillId} left no end beat`);
  return only;
}

/** Plays `effect` out at 60 Hz and returns how long it stayed on stage. */
function lifetime(effect: Effect | undefined): number {
  if (!effect) throw new Error('no effect to play out');
  let frames = 0;
  while (!effect.done && frames < 600) {
    effect.update(1 / 60);
    frames++;
  }
  return frames / 60;
}

const spark = () => new Burst(0, 0, BURSTS.hitSpark, new Rng(1));

describe('what each skill hands its look', () => {
  it('FULL-STACK ATTACK: its own hit sparks, a struck spark with the beam, and an end beat', () => {
    const world = new FakeSkillWorld();
    world.addCustomer(180);
    world.run(SKILLS['full-stack-attack'].cast(world), 1);
    const burst = spark();
    expect(world.hits[0]?.spark?.(burst)).toMatchObject({ skillId: 'full-stack-attack', fx: { role: 'hit', burst } });
    const { state } = endedOf(world, 'full-stack-attack');
    const struck = fxOf(world, 'full-stack-attack').find((fx) => fx.role === 'struck');
    expect(struck).toMatchObject({ facing: 1, area: state.area });
    // The beam reaches from the hand to the edge of the view, which is also what it hits.
    expect(state.area && state.area.x + state.area.w).toBe(world.view.x + world.view.w);
  });

  it('AGENT SUMMON: where and when the drone last fired, if it did, and an end beat', () => {
    const world = new FakeSkillWorld();
    const customer = world.addCustomer(200, 200, 99);
    world.run(SKILLS['agent-summon'].cast(world), 9);
    const { lastShot } = endedOf(world, 'agent-summon').state;
    expect(lastShot?.toward).toEqual({ x: customer.rect.x + 7, y: customer.rect.y + 14 });
    expect(lastShot?.age).toBeGreaterThan(7);

    const empty = new FakeSkillWorld();
    empty.run(SKILLS['agent-summon'].cast(empty), 9);
    expect(endedOf(empty, 'agent-summon').state.lastShot).toBeNull();
  });

  it('UX ELIXIR: sparkles over customers under the spell, the running elixir for them, and an end beat', () => {
    const world = new FakeSkillWorld();
    world.addCustomer(200);
    const elixir = SKILLS['ux-elixir'].cast(world);
    expect(runningElixir([SKILLS['churn-shield'].cast(world), elixir])).toBe(elixir);
    expect(runningElixir([SKILLS['churn-shield'].cast(world)])).toBeNull();
    world.run(elixir, 7);
    expect(rolesOf(world, 'ux-elixir').filter((role) => role === 'sparkle').length).toBeGreaterThan(20);
    expect(endedOf(world, 'ux-elixir').state.age).toBeGreaterThanOrEqual(6);
  });

  it('POWER CHORD: three rings, and a stun mark per stunned customer that lasts as long as the stun', () => {
    const world = new FakeSkillWorld();
    const near = world.addCustomer(150);
    const far = world.addCustomer(310);
    world.addCustomer(700);
    const strum = SKILLS['power-chord'].cast(world);
    const marks = fxOf(world, 'power-chord').flatMap((fx) => (fx.role === 'stunned' ? [fx] : []));
    expect(marks.map((mark) => mark.target)).toEqual([near, far]);
    expect(marks.every((mark) => mark.target.stunned && mark.timer.seconds === 3)).toBe(true);
    expect(marks[0]?.origin).toEqual({ x: world.caster.x, y: world.caster.y });
    expect(lifetime(world.effects[0])).toBeCloseTo(3, 1);
    world.run(strum, 1);
    expect(rolesOf(world, 'power-chord')).toEqual(['stunned', 'stunned', 'ring', 'ring', 'ring', 'ended']);
  });

  it('NORTH STAR: a launch burst, the customer the star is homing on, and its own hit and impact sparks', () => {
    const world = new FakeSkillWorld();
    world.addCustomer(60, 200, 1);
    const angriest = world.addCustomer(260, 200, 3);
    SKILLS['north-star'].cast(world);
    expect(rolesOf(world, 'north-star')).toEqual(['launch']);
    const [star] = world.shots;
    if (!(star instanceof HomingStar)) throw new Error('NORTH STAR fires a HomingStar');
    expect(star.target).toBeNull();
    star.update(1 / 60, { grid: new TileGrid(40, 15, 8), targets: world.targets() });
    expect(star.target).toBe(angriest.rect);
    expect(star.trail).toHaveLength(1);
    expect(star.hitEffect(spark())).toMatchObject({ skillId: 'north-star', fx: { role: 'hit' } });
    expect(star.impactEffect(spark())).toMatchObject({ skillId: 'north-star', fx: { role: 'impact' } });
  });

  it('CHURN SHIELD: a hit spark for every bump, and an end beat that stays on stage for LOOK_EFFECT_SECONDS', () => {
    const world = new FakeSkillWorld();
    world.addCustomer(112, 200, 9);
    world.run(SKILLS['churn-shield'].cast(world), 6);
    expect(world.hits.length).toBeGreaterThan(1);
    for (const hit of world.hits) {
      expect(hit.spark?.(spark())).toMatchObject({ skillId: 'churn-shield', fx: { role: 'hit' } });
    }
    expect(endedOf(world, 'churn-shield').timer.age).toBe(0);
    expect(lifetime(world.effects.at(-1))).toBeCloseTo(LOOK_EFFECT_SECONDS, 1);
  });
});
