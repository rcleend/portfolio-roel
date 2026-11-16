import { describe, expect, it } from 'vitest';
import type { IdleTask, IdleTaskOptions } from '../stage/IdleWork';
import { PostersSlot, type PosterWallLoader } from './PostersSlot';
import type { PosterWallContext, PosterWallEvents } from './PosterWall';

/** A background queue that only records what is added and dropped. */
function recordingContext() {
  const queued: { task: IdleTask; options: IdleTaskOptions | undefined; dropped: boolean }[] = [];
  const background = {
    add(task: IdleTask, options?: IdleTaskOptions) {
      const entry = { task, options, dropped: false };
      queued.push(entry);
      return () => {
        entry.dropped = true;
      };
    },
  };
  return { queued, context: { background } as unknown as PosterWallContext };
}

/** A loader that never settles: these tests are about the TV's unit, not the chunk. */
function countingLoader(): { load: PosterWallLoader; calls: () => number } {
  let calls = 0;
  return {
    load: () => {
      calls++;
      return new Promise(() => {});
    },
    calls: () => calls,
  };
}

/** A loader whose PosterWall only hands its events to the test. */
function eventsLoader(): { load: PosterWallLoader; events: () => PosterWallEvents } {
  let events: PosterWallEvents | null = null;
  class FakeWall {
    constructor(_context: PosterWallContext, _kit: unknown, given: PosterWallEvents) {
      events = given;
    }
    depart(): void {}
  }
  return {
    load: () => Promise.resolve({ PosterWall: FakeWall } as unknown as typeof import('./PosterWall')),
    events: () => {
      if (!events) throw new Error('No PosterWall yet');
      return events;
    },
  };
}

describe('PostersSlot', () => {
  it('queues the TV unit as ordinary background work with its own small estimate', () => {
    const { queued, context } = recordingContext();
    new PostersSlot(true, countingLoader().load).attach(context);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.options).toEqual({ estimateMs: 1 });
  });

  it('queues a TV unit still waiting at the departure again, urgent and sliced', () => {
    const { queued, context } = recordingContext();
    const loader = countingLoader();
    const slot = new PostersSlot(true, loader.load);
    slot.attach(context);
    slot.depart();
    expect(queued).toHaveLength(2);
    expect(queued[0]?.dropped).toBe(true);
    const urgent = queued[1]?.options;
    expect(urgent?.urgent?.()).toBe(true);
    expect(urgent?.sliceMs).toBeGreaterThan(0);
    queued[1]?.task.next();
    expect(loader.calls()).toBe(1);
  });

  it('queues nothing more once the TV unit ran', () => {
    const { queued, context } = recordingContext();
    const slot = new PostersSlot(true, countingLoader().load);
    slot.attach(context);
    queued[0]?.task.next();
    slot.depart();
    expect(queued).toHaveLength(1);
  });

  it('queues nothing with the posters off', () => {
    const { queued, context } = recordingContext();
    const slot = new PostersSlot(false, countingLoader().load);
    slot.attach(context);
    slot.depart();
    expect(queued).toHaveLength(0);
    expect(slot.state).toBe('off');
  });

  it('reports the atlas painted at the TV, then shown', async () => {
    const { queued, context } = recordingContext();
    const loader = eventsLoader();
    const slot = new PostersSlot(true, loader.load);
    slot.attach(context);
    queued[0]?.task.next();
    await Promise.resolve();
    expect(slot.state).toBe('loading');
    loader.events().onStaged();
    expect(slot.state).toBe('staged');
    loader.events().onShown();
    expect(slot.state).toBe('ready');
    await expect(slot.ready).resolves.toBe(true);
    // A context loss takes them down until they are back: the stats never read ready over a bare wall.
    loader.events().onLost();
    expect(slot.state).toBe('loading');
    loader.events().onShown();
    expect(slot.state).toBe('ready');
  });

  it('goes off when the wall fails after painting', async () => {
    const { queued, context } = recordingContext();
    const loader = eventsLoader();
    const slot = new PostersSlot(true, loader.load);
    slot.attach(context);
    queued[0]?.task.next();
    await Promise.resolve();
    loader.events().onStaged();
    loader.events().onFailed(new Error('lost'));
    expect(slot.state).toBe('off');
    await expect(slot.ready).resolves.toBe(false);
  });
});
