import { describe, expect, it } from 'vitest';
import { IDLE_INTENT } from '../../entities/player/Player';
import { createTestWorld } from '../../world/testing';
import { HudTracker } from './HudTracker';

const DT = 1 / 60;

describe('HudTracker', () => {
  it('reports the character, hearts, skills, MRR and highlights', () => {
    const world = createTestWorld('scripe', 'strategy');
    const hud = new HudTracker().hud(world, 0, 'keyboard');
    expect(hud).toMatchObject({ characterId: 'strategy', hearts: 5, maxHearts: 5, score: 0 });
    expect(hud.highlights).toEqual({ collected: 0, total: 4 });
    expect(hud.slots.map((slot) => [slot.skillId, slot.key])).toEqual([
      ['north-star', { text: 'C' }],
      ['churn-shield', { text: 'V' }],
    ]);
  });

  it('remembers when a heart was lost and when a skill became ready again', () => {
    const world = createTestWorld('luna', 'artsy');
    const tracker = new HudTracker();
    world.step({ ...IDLE_INTENT, skill2Pressed: true }, DT);
    tracker.update(world, 0, DT);
    world.player.hurt(world.player.centerX + 10, world.time);
    tracker.update(world, 1, DT);
    expect(tracker.hud(world, 1.25, 'keyboard').hurtFor).toBeCloseTo(0.25);
    for (let t = 0; t < 11; t += DT) world.step(IDLE_INTENT, DT);
    tracker.update(world, 12, DT);
    expect(tracker.hud(world, 12.5, 'gamepad').slots[1]).toMatchObject({ readyFor: 0.5, key: { text: 'B' } });
  });

  it('shows the boss bar only once the escalated customer has landed', () => {
    const world = createTestWorld();
    const tracker = new HudTracker();
    expect(tracker.bossBar(world, 0)).toBeNull();
  });
});
