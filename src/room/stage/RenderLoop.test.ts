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
});
