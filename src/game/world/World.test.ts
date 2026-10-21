import { describe, expect, it } from 'vitest';
import { getExperience, getLevel, type LevelId } from '@/content';
import { Rng } from '@/engine/math/Rng';
import { IDLE_INTENT, type PlayerIntent } from '../entities/player/Player';
import { STAGES } from '../scenes/level/stages';
import type { WorldEvent } from './events';
import { TILE } from './grid';
import { World } from './World';

const DT = 1 / 60;
const PROPS = {
  cableCar: { width: 96, height: 48 },
  rateLimitGate: { width: 24, height: 48 },
  uBahn: { width: 160, height: 58 },
  baustelle: { width: 48, height: 32 },
  scopeCreep: { width: 32, height: 32 },
};

function createWorld(levelId: LevelId = 'luna', characterId: 'hackerman' | 'artsy' | 'strategy' = 'hackerman'): World {
  const level = getLevel(levelId);
  return new World({
    stage: STAGES[levelId],
    props: PROPS,
    characterId,
    highlightIds: getExperience(level.experienceId).highlights.map((highlight) => highlight.id),
    complaints: level.complaints,
    layoutBubble: (text) => ({ lines: [text], width: text.length * 4, height: 9, lineHeight: 10 }),
    rng: new Rng(3),
    reducedMotion: false,
    screen: { width: 320, height: 240 },
  });
}

function run(world: World, seconds: number, intent: PlayerIntent | ((t: number) => PlayerIntent) = IDLE_INTENT) {
  const events: WorldEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    world.step(typeof intent === 'function' ? intent(i * DT) : intent, DT);
    events.push(...world.drainEvents());
  }
  return events;
}

const kinds = (events: readonly WorldEvent[]) => events.map((event) => event.kind);

describe('World', () => {
  it('starts the player on the ground at the start marker with full hearts', () => {
    const world = createWorld();
    run(world, 0.2);
    expect(world.player.feet).toBe(200);
    expect(world.player.centerX).toBe(STAGES.luna.layout.start.col * TILE + TILE / 2);
    expect(world.player.hearts).toBe(5);
  });

  it('wins a customer over with primary attacks, scoring their MRR', () => {
    const world = createWorld();
    const events = run(world, 4, { ...IDLE_INTENT, attackHeld: true });
    const won = events.filter((event) => event.kind === 'customerWon');
    expect(won.length).toBe(1);
    expect(world.score).toBe(99);
    expect(world.result().customersWon).toBe(1);
    expect(events).toContainEqual({ kind: 'sfx', id: 'attack-code' });
    expect(events).toContainEqual({ kind: 'sfx', id: 'customer-happy' });
  });

  it('collects a highlight by head-butting its block', () => {
    const world = createWorld();
    const block = STAGES.luna.layout.blocks[0];
    if (!block) throw new Error('no block');
    world.skipTo(0);
    world.player.respawn(block.col * TILE + TILE / 2, 200, world.time);
    run(world, 0.2);
    const events = run(world, 0.6, (t) => ({ ...IDLE_INTENT, jumpPressed: t === 0, jumpHeld: true }));
    expect(events).toContainEqual({ kind: 'highlight', highlightId: 'luna-agent' });
    expect(world.highlights).toEqual(['luna-agent']);
  });

  it('casts skills, which then cool down', () => {
    const world = createWorld('luna', 'artsy');
    let events = run(world, 0.1, { ...IDLE_INTENT, skill2Pressed: true });
    expect(events).toContainEqual({ kind: 'skillCast', skillId: 'power-chord' });
    events = run(world, 1, { ...IDLE_INTENT, skill2Pressed: true });
    expect(kinds(events)).not.toContain('skillCast');
    expect(world.slots[1].ready).toBe(false);
  });

  it('takes a heart for falling into a pit and respawns at the last checkpoint', () => {
    const world = createWorld();
    world.skipTo(0);
    const checkpointX = world.checkpoints[0]?.x ?? 0;
    const events = run(world, 6, { ...IDLE_INTENT, x: 1 });
    expect(events).toContainEqual({ kind: 'playerDown', reason: 'pit' });
    expect(world.player.hearts).toBe(4);
    world.respawn(false);
    expect(world.player.centerX).toBe(checkpointX);
    expect(world.player.hearts).toBe(4);
  });

  it('drops the escalated customer when the arena is entered and reports the retention', () => {
    const world = createWorld();
    world.skipTo('arena');
    const events = run(world, 3, { ...IDLE_INTENT, x: 1 });
    expect(kinds(events)).toEqual(expect.arrayContaining(['arenaEntered', 'bossLanded']));
    const boss = world.boss;
    expect(boss?.escalated).toBe(true);
    if (!boss) return;
    for (let i = 0; i < 100 && boss.active; i++) world.hit(boss, 1, 1);
    expect(kinds(world.drainEvents())).toContain('bossRetained');
    expect(world.score).toBe(2_500);
  });

  it('never lets the camera leave the arena once inside', () => {
    const world = createWorld();
    world.skipTo('arena');
    run(world, 2, { ...IDLE_INTENT, x: 1 });
    run(world, 3, { ...IDLE_INTENT, x: -1 });
    expect(world.camera.view.x).toBeGreaterThanOrEqual(world.arenaX);
    expect(world.player.body.x).toBeGreaterThanOrEqual(world.arenaX);
  });
});
