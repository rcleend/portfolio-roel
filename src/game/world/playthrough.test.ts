import { describe, expect, it } from 'vitest';
import { getExperience, getLevel, type LevelId } from '@/content';
import { Rng } from '@/engine/math/Rng';
import { STAGES } from '../scenes/level/stages';
import { Autopilot } from './autopilot';
import type { WorldEvent } from './events';
import { World } from './World';

const DT = 1 / 60;
const PROPS = {
  cableCar: { width: 96, height: 48 },
  rateLimitGate: { width: 24, height: 48 },
  uBahn: { width: 160, height: 58 },
  baustelle: { width: 48, height: 32 },
  scopeCreep: { width: 32, height: 32 },
};

interface Run {
  readonly seconds: number;
  readonly events: readonly WorldEvent[];
  readonly world: World;
}

/** Plays a level with the autopilot until the escalated customer is retained (or two minutes pass). */
function playthrough(levelId: LevelId, characterId: 'hackerman' | 'artsy' | 'strategy'): Run {
  const level = getLevel(levelId);
  const world = new World({
    stage: STAGES[levelId],
    props: PROPS,
    characterId,
    highlightIds: getExperience(level.experienceId).highlights.map((highlight) => highlight.id),
    complaints: level.complaints,
    layoutBubble: (text) => ({ lines: [text.slice(0, 14), text.slice(14)], width: 70, height: 19, lineHeight: 10 }),
    rng: new Rng(11),
    reducedMotion: false,
    screen: { width: 320, height: 240 },
  });
  const pilot = new Autopilot();
  const events: WorldEvent[] = [];
  for (let frame = 0; frame < 120 * 60; frame++) {
    world.step(pilot.intent(world), DT);
    const drained = world.drainEvents();
    events.push(...drained);
    // The level scene fades and respawns after a fall; do the same.
    if (drained.some((event) => event.kind === 'playerDown')) world.respawn(world.player.hearts === 0);
    if (drained.some((event) => event.kind === 'bossRetained')) break;
  }
  return { seconds: world.time, events, world };
}

describe.each(['luna', 'scripe'] as const)('playing %s start to finish', (levelId) => {
  it.each(['hackerman', 'artsy', 'strategy'] as const)(
    '%s retains the escalated customer in a short level',
    (character) => {
      const run = playthrough(levelId, character);
      const kinds = run.events.map((event) => event.kind);
      expect(kinds).toContain('bossRetained');
      expect(kinds.filter((kind) => kind === 'checkpoint').length).toBe(STAGES[levelId].layout.checkpoints.length);
      // A competent first-timer: comfortably inside the 60–90 s a casual player should need.
      expect(run.seconds).toBeGreaterThan(25);
      expect(run.seconds).toBeLessThan(75);
      expect(run.world.result().customersWon).toBeGreaterThanOrEqual(STAGES[levelId].layout.customers.length / 2);
    },
  );
});
