import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IdleTask, IdleWork } from '../stage/IdleWork';
import { RainSoundSlot } from './RainSoundSlot';

const made = vi.hoisted(() => ({ count: 0, active: [] as boolean[] }));
vi.mock('./RainSound', () => ({
  RainSound: class {
    ready = false;
    playing = false;
    constructor() {
      made.count++;
    }
    setActive(active: boolean): void {
      made.active.push(active);
    }
    dispose(): void {}
  },
}));

/** The room's idle work as the slot sees it: tasks queue, and run a unit when the test says the page is idle. */
function idleWork() {
  const queue: IdleTask[] = [];
  const background = {
    add: (task: IdleTask) => {
      queue.push(task);
      return () => void queue.splice(queue.indexOf(task), 1);
    },
  } as unknown as IdleWork;
  const idle = (): void => {
    for (const task of queue.splice(0)) if (!task.next().done) queue.push(task);
  };
  return { background, queue, idle };
}

describe('RainSoundSlot', () => {
  afterEach(() => {
    made.count = 0;
    made.active = [];
  });

  it('makes the sound in a unit of idle work, never as its code arrives: a camera in flight is not held up', async () => {
    const { background, queue, idle } = idleWork();
    const slot = new RainSoundSlot();
    slot.setMuted(false);
    slot.prepare(background);
    // The first unit only asks for the code.
    idle();
    await vi.waitFor(() => expect(queue).toHaveLength(1));
    // The code is in and the camera flies (idle work runs nothing then): no audio context is made.
    expect(made.count).toBe(0);
    expect(slot.ready).toBe(false);
    slot.setView('room');
    // The camera has landed and the page is idle: now, and it hears where the camera is.
    idle();
    expect(made.count).toBe(1);
    expect(made.active).toEqual([true]);
    expect(queue).toHaveLength(0);
  });

  it('makes nothing once the room is gone', async () => {
    const { background, queue, idle } = idleWork();
    const slot = new RainSoundSlot();
    slot.prepare(background);
    idle();
    await vi.waitFor(() => expect(queue).toHaveLength(1));
    slot.dispose();
    expect(queue).toHaveLength(0);
    expect(made.count).toBe(0);
  });
});
