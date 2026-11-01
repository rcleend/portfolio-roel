import { describe, expect, it } from 'vitest';
import { getExperience, getLevel, type LevelId } from '@/content';
import { Rng } from '@/engine/math/Rng';
import { IDLE_INTENT } from '../../entities/player/Player';
import { STAGES } from '../../scenes/level/stages';
import { TEST_PROPS } from '../testing';
import { World } from '../World';
import { navKit } from './kit';
import type { Ledge } from './ledges';
import { Nav } from './Nav';
import { RouteWalker, type WalkStatus } from './RouteWalker';
import { type Goal, planRoute } from './route';

const nav = new Nav(navKit);

const DT = 1 / 60;

/** A stage's world with nobody in it, so only the ground, the jumps and the vehicles decide a walk. */
function quietWorld(levelId: LevelId): World {
  const stage = STAGES[levelId];
  const level = getLevel(levelId);
  return new World({
    stage: { ...stage, layout: { ...stage.layout, customers: [] } },
    props: TEST_PROPS,
    characterId: 'hackerman',
    highlightIds: getExperience(level.experienceId).highlights.map((highlight) => highlight.id),
    complaints: level.complaints,
    layoutBubble: (text) => ({ lines: [text], width: 70, height: 10, lineHeight: 10 }),
    rng: new Rng(5),
    reducedMotion: true,
    screen: { width: 320, height: 240 },
  });
}

/** Walks to `goal` and reports how it ended; respawns like the level does after a fall. */
function walk(world: World, goal: Goal, seconds = 30): WalkStatus | 'unplanned' | 'fell' {
  const route = planRoute(nav, world, goal);
  if (!route) return 'unplanned';
  const walker = new RouteWalker(nav, goal, route);
  for (let frame = 0; frame < seconds * 60 && walker.status === 'walking'; frame++) {
    world.step(walker.intent(world, DT), DT);
    if (world.drainEvents().some((event) => event.kind === 'playerDown')) return 'fell';
  }
  return walker.status;
}

function settle(world: World): void {
  for (let frame = 0; frame < 30; frame++) world.step(IDLE_INTENT, DT);
}

const middle = (ledge: Ledge): number => (ledge.x0 + ledge.x1) / 2;

describe.each(['luna', 'scripe'] as const)('walking %s', (levelId) => {
  it('reaches every ledge before the arena from the one before it, left to right', () => {
    const world = quietWorld(levelId);
    settle(world);
    const ledges = nav
      .ledges(world)
      .filter((ledge) => ledge.kind !== 'block' && ledge.x1 <= world.arenaX)
      .toSorted((a, b) => middle(a) - middle(b));
    const results = ledges.map((ledge) => {
      const status = walk(world, { kind: 'stand', ledge, x: middle(ledge) });
      return `${ledge.kind}@${ledge.x0}-${ledge.x1}: ${status}`;
    });
    expect(results.filter((line) => !line.endsWith('arrived'))).toEqual([]);
  });

  it('head-butts every "?" block, in order', () => {
    const world = quietWorld(levelId);
    settle(world);
    const results = world.blocks.map((block) => {
      const status = walk(world, { kind: 'bump', block });
      return `block@${block.col}: ${status} ${block.used ? 'used' : 'unused'}`;
    });
    expect(results.filter((line) => !line.endsWith('arrived used'))).toEqual([]);
    expect(world.highlights).toHaveLength(world.blocks.length);
  });
});
