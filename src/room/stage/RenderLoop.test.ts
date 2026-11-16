import { describe, expect, it, vi } from 'vitest';
import { type FrameScheduler, RenderLoop } from './RenderLoop';

function fakeScheduler() {
  const queue = new Map<number, (now: number) => void>();
  let next = 1;
  let now = 0;
  const scheduler: FrameScheduler = {
    request: (cb) => {
      queue.set(next, cb);
      return next++;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
  };
  const tick = () => {
    now += 16;
    const callbacks = [...queue.values()];
    queue.clear();
    for (const cb of callbacks) cb(now);
  };
  return { scheduler, tick, pending: () => queue.size };
}

describe('RenderLoop', () => {
  it('draws nothing until invalidated', () => {
    const { scheduler, pending } = fakeScheduler();
    const draw = vi.fn();
    new RenderLoop(draw, scheduler);
    expect(pending()).toBe(0);
    expect(draw).not.toHaveBeenCalled();
  });

  it('coalesces several invalidations into one draw', () => {
    const { scheduler, tick } = fakeScheduler();
    const draw = vi.fn();
    const loop = new RenderLoop(draw, scheduler);
    loop.invalidate();
    loop.invalidate();
    tick();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(loop.idle).toBe(true);
  });

  it('keeps drawing while an animation step asks for more frames', () => {
    const { scheduler, tick } = fakeScheduler();
    const draw = vi.fn();
    const loop = new RenderLoop(draw, scheduler);
    let remaining = 3;
    loop.animate(() => --remaining > 0);
    for (let i = 0; i < 5; i++) tick();
    expect(draw).toHaveBeenCalledTimes(3);
    expect(loop.framesRendered).toBe(3);
    expect(loop.idle).toBe(true);
  });

  it('stops an animation when its stop handle is called', () => {
    const { scheduler, tick } = fakeScheduler();
    const loop = new RenderLoop(() => {}, scheduler);
    const stop = loop.animate(() => true);
    tick();
    stop();
    tick();
    tick();
    expect(loop.framesRendered).toBe(2);
    expect(loop.idle).toBe(true);
  });

  it('cancels pending frames on dispose', () => {
    const { scheduler, pending } = fakeScheduler();
    const loop = new RenderLoop(() => {}, scheduler);
    loop.animate(() => true);
    loop.dispose();
    expect(pending()).toBe(0);
    loop.invalidate();
    expect(pending()).toBe(0);
  });

  it('tells a run of frames from frames that were only waited for', () => {
    let time = 0;
    let queued: ((now: number) => void) | null = null;
    const scheduler: FrameScheduler = {
      request: (callback) => {
        queued = callback;
        return 1;
      },
      cancel: () => {},
    };
    /** The display's next frame, at `at`. */
    const frame = (at: number): void => {
      time = at;
      const callback = queued;
      queued = null;
      callback?.(at);
    };
    const intervals: (number | null)[] = [];
    const loop: RenderLoop = new RenderLoop(
      () => intervals.push(loop.runInterval),
      scheduler,
      () => time,
    );
    // An animation asks for its next frame as each one ends: a run, 16 ms a frame.
    let steps = 3;
    loop.animate(() => --steps > 0);
    frame(16);
    frame(32);
    frame(48);
    // The lava's tick asks 42 ms after the last frame, the radio's float 17 ms after that one: frames that were waited
    // for, however soon they came.
    time = 90;
    loop.invalidate();
    frame(96);
    time = 113;
    loop.invalidate();
    frame(130);
    // The game's next frame is asked for right after, and a slow GPU delivers it late: a run's frame, 34 ms.
    time = 133;
    loop.invalidate(true);
    frame(164);
    // A game's frame after a long gap (it was paused) starts a run; it is not yet one.
    time = 400;
    loop.invalidate(true);
    frame(416);
    expect(intervals).toEqual([null, 16, 16, null, null, 34, null]);
  });
});
