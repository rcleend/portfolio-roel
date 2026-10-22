import { type CharacterId, getCharacter, type SkillId } from '@/content';
import type { World } from '../../world/World';
import type { Beat } from './script';

/**
 * The random stream the demos were choreographed against: with it, customers
 * shout on the beats the scripts expect, whatever seed the game runs with.
 */
export const DEMO_SEED = 7;

/** One loop of the showcase: how long it runs, where customers start, and what happens when. */
export interface ShowcaseDemo {
  /** Seconds before the loop starts over. */
  readonly seconds: number;
  /** Arena columns the customers start in; they walk in once they see the hero. */
  readonly customers: readonly number[];
  readonly beats: readonly Beat[];
}

/** The hero's whole move set: idle, run, jump and fall, attack bursts at a customer, a skill, hurt and victory. */
export const MOVES_DEMO: ShowcaseDemo = {
  seconds: 7,
  customers: [16],
  beats: [
    { from: 0.8, to: 1.5, hold: { x: 1 } },
    { from: 1.5, to: 1.8, hold: { x: -1 } },
    // Turn back to the customer, burst its complaint on the way to it, then the skill settles it.
    { from: 1.9, to: 1.95, hold: { x: 1 } },
    { from: 2, to: 2.9, hold: { attackHeld: true } },
    { at: 3, press: 'skill1' },
    { at: 3.7, press: 'jump' },
    { from: 3.7, to: 4, hold: { jumpHeld: true } },
    { at: 4.7, act: (world) => world.player.hurt(world.player.centerX + 16, world.time) },
    { at: 5.4, act: (world) => world.player.strike('victory', world.time, 1.3) },
  ],
};

/** The customer's moods: walking in, shouting, hurt by a hit, stunned, then won over and happy. */
export const CUSTOMER_DEMO: ShowcaseDemo = {
  seconds: 7,
  // One customer, so every mood reads on its own.
  customers: [13],
  beats: [
    // The hero steps up and attacks: the first shot bursts the complaint in flight, the next ones land.
    { from: 0.8, to: 1.2, hold: { x: 1 } },
    { from: 1.3, to: 2.2, hold: { attackHeld: true } },
    { at: 2.7, act: (world) => everyone(world, (target) => world.stun(target, 2)) },
    { at: 4.9, act: (world) => everyone(world, (target) => world.hit(target, 99, 1)) },
  ],
};

/** How a skill is staged: customers close enough to be hit, and long enough for the effect to play out. */
interface SkillStaging {
  readonly seconds: number;
  readonly customers: readonly number[];
  /** Seconds into the loop the hero casts. */
  readonly castAt: number;
  /** What the hero does once the skill is cast. */
  readonly afterwards: readonly Beat[];
}

const SKILL_STAGING: Readonly<Record<SkillId, SkillStaging>> = {
  'full-stack-attack': { seconds: 2.6, customers: [15, 18], castAt: 0.5, afterwards: [] },
  'agent-summon': { seconds: 9, customers: [13, 16], castAt: 0.4, afterwards: [] },
  // Under the elixir customers dawdle, so the hero goes to them: a single hit wins each one over.
  'ux-elixir': {
    seconds: 7,
    customers: [14, 17],
    castAt: 0.2,
    afterwards: [
      { from: 0.6, to: 1.5, hold: { x: 1 } },
      { from: 1.6, to: 3.4, hold: { attackHeld: true } },
    ],
  },
  'power-chord': { seconds: 4.6, customers: [13, 16], castAt: 0.9, afterwards: [] },
  'north-star': { seconds: 3.4, customers: [17, 19], castAt: 0.5, afterwards: [] },
  // Customers keep their distance, so the hero walks the bubble into them.
  'churn-shield': {
    seconds: 6,
    customers: [12, 16],
    castAt: 0.4,
    afterwards: [{ from: 0.9, to: 2.6, hold: { x: 1 } }],
  },
};

/** `hero` casts `skill` at customers walking in, and the effect plays out in full before the loop starts over. */
export function skillDemo(hero: CharacterId, skill: SkillId): ShowcaseDemo {
  const slot = getCharacter(hero).skills.indexOf(skill) === 0 ? 'skill1' : 'skill2';
  const { seconds, customers, castAt, afterwards } = SKILL_STAGING[skill];
  return { seconds, customers, beats: [{ at: castAt, press: slot }, ...afterwards] };
}

function everyone(world: World, act: (target: ReturnType<World['targets']>[number]) => void): void {
  for (const target of world.targets()) act(target);
}
