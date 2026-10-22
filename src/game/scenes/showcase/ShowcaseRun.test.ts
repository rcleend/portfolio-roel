import { describe, expect, it } from 'vitest';
import { characters, type SkillId, skills } from '@/content';
import type { CharacterAnimation } from '../../art/looks/contracts';
import type { WorldEvent } from '../../world/events';
import { TEST_PROPS } from '../../world/testing';
import type { ShowcaseParams } from '../params';
import { DEMO_SEED } from './demos';
import { resolveShowcase } from './params';
import { ShowcaseRun } from './ShowcaseRun';

function start(params: ShowcaseParams, seed = DEMO_SEED): ShowcaseRun {
  const { demo, hero, levelId } = resolveShowcase(params);
  return new ShowcaseRun({
    levelId,
    hero,
    demo,
    props: TEST_PROPS,
    layoutBubble: (text) => ({ lines: [text.slice(0, 14), text.slice(14)], width: 70, height: 19, lineHeight: 10 }),
    seed,
    reducedMotion: false,
  });
}

/** Everything that decides a frame: the hero, every customer, shot and bubble. */
function snapshot(run: ShowcaseRun): string {
  const { world } = run;
  const { player } = world;
  return JSON.stringify([
    run.step,
    player.body,
    player.pose(world.time),
    player.hearts,
    world.customers.map((customer) => [customer.body, customer.mood, customer.frustration]),
    world.shots.map((shot) => [shot.x, shot.y, shot.age]),
    world.bubbles.map((bubble) => bubble.center),
    world.activeSkills.length,
  ]);
}

/** Plays `steps` steps, recording a snapshot and the events of each. */
function play(run: ShowcaseRun, steps: number): { frames: string[]; events: WorldEvent[] } {
  const frames: string[] = [];
  const events: WorldEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...run.advance());
    frames.push(snapshot(run));
  }
  return { frames, events };
}

const loopSteps = (params: ShowcaseParams) => Math.round(resolveShowcase(params).demo.seconds * 60);

const DEMOS: readonly ShowcaseParams[] = [
  ...characters.map((character) => ({ demo: 'moves', hero: character.id }) as const),
  { demo: 'customer' },
  ...(Object.keys(skills) as SkillId[]).map((skill) => ({ demo: 'skill', skill }) as const),
];

describe('ShowcaseRun', () => {
  it.each(DEMOS)('plays %j the same way every time, and every loop like the first', (params) => {
    const steps = loopSteps(params);
    const first = play(start(params), steps * 2);
    const again = play(start(params), steps * 2);
    expect(again.frames).toEqual(first.frames);
    // The loop starts over seamlessly: the second pass repeats the first frame for frame.
    expect(first.frames.slice(steps)).toEqual(first.frames.slice(0, steps));
  });

  it.each(characters.map((character) => character.id))('shows %s every move', (hero) => {
    const run = start({ demo: 'moves', hero });
    const seen = new Set<CharacterAnimation>();
    for (let i = 0; i < loopSteps({ demo: 'moves' }) - 1; i++) {
      run.advance();
      seen.add(run.world.player.pose(run.world.time).animation);
    }
    expect([...seen].sort()).toEqual(['attack', 'fall', 'hurt', 'idle', 'jump', 'run', 'skill', 'victory']);
  });

  it.each(Object.keys(skills) as SkillId[])('casts %s at customers and lets it land', (skill) => {
    const { events } = play(start({ demo: 'skill', skill }), loopSteps({ demo: 'skill', skill }) - 1);
    expect(events).toContainEqual({ kind: 'skillCast', skillId: skill });
    const landed = events.filter(
      (event) => event.kind === 'sfx' && (event.id === 'hit' || event.id === 'customer-happy'),
    );
    const stunned = skill === 'power-chord';
    expect(stunned || landed.length > 0).toBe(true);
  });

  it('walks the customers through every mood', () => {
    const run = start({ demo: 'customer' });
    const moods = new Set<string>();
    for (let i = 0; i < loopSteps({ demo: 'customer' }) - 1; i++) {
      run.advance();
      for (const customer of run.world.customers) moods.add(customer.mood.kind);
    }
    expect([...moods]).toEqual(expect.arrayContaining(['approach', 'windup', 'hurt', 'stunned', 'won']));
  });
});
