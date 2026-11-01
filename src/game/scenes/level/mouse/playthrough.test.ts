import { describe, expect, it } from 'vitest';
import type { CharacterId, LevelId } from '@/content';
import { navKit } from '../../../world/nav/kit';
import { Nav } from '../../../world/nav/Nav';
import { createTestWorld } from '../../../world/testing';
import { STAGES } from '../stages';
import { MouseBot } from './MouseBot';
import { MousePlay } from './MousePlay';
import { TestMouse } from './testing';

const DT = 1 / 60;
/** Generous: a visitor clicking their way through has every right to take longer than a keyboard. */
const LIMIT_SECONDS = 300;

/**
 * A level played with the mouse alone, the way the level scene plays it: the mouse's intent steps the world, a fall
 * fades to a respawn, and the walk the mouse asked for is forgotten with it.
 */
function playWithTheMouse(levelId: LevelId, characterId: CharacterId) {
  const world = createTestWorld(levelId, characterId, 13);
  const mouse = new TestMouse();
  const play = new MousePlay(navKit);
  const bot = new MouseBot(new Nav(navKit), mouse);
  const kinds: string[] = [];
  let time = 0;
  for (let frame = 0; frame < LIMIT_SECONDS * 60; frame++) {
    bot.act(world, play.walking);
    world.step(play.update(mouse.snapshot(), world, time, DT, true), DT);
    time += DT;
    const events = world.drainEvents();
    kinds.push(...events.map((event) => event.kind));
    if (events.some((event) => event.kind === 'playerDown')) {
      world.respawn(world.player.hearts === 0);
      play.reset();
    }
    if (events.some((event) => event.kind === 'bossRetained')) break;
  }
  return { world, kinds, seconds: time };
}

describe.each(['luna', 'scripe'] as const)('%s with the mouse alone', (levelId) => {
  it.each(['hackerman', 'artsy', 'strategy'] as const)(
    '%s gets through every pit, girder and vehicle to win the escalated customer over',
    (characterId) => {
      const { world, kinds, seconds } = playWithTheMouse(levelId, characterId);
      expect(kinds).toContain('bossRetained');
      expect(kinds.filter((kind) => kind === 'checkpoint')).toHaveLength(STAGES[levelId].layout.checkpoints.length);
      // Every career highlight, the ones over the vehicles' gaps included.
      expect(world.highlights).toHaveLength(world.blocks.length);
      expect(seconds).toBeLessThan(LIMIT_SECONDS);
    },
  );
});
