import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FrameScheduler, PACED_MIN_INTERVAL_MS, RenderLoop } from './RenderLoop';

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

/** A display of `hz` frames a second: `frames(n)` runs its next n frames, each calling back whoever asked for it. */
function display(hz: number) {
  const queue = new Map<number, (now: number) => void>();
  let next = 1;
  let count = 0;
  const scheduler: FrameScheduler = {
    request: (callback) => {
      queue.set(next, callback);
      return next++;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
  };
  const state = { now: 0 };
  const frames = (n: number, between?: () => void): void => {
    for (let i = 0; i < n; i++) {
      between?.();
      count++;
      state.now = (count * 1000) / hz;
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(state.now);
    }
  };
  return { scheduler, frames, state, pending: () => queue.size };
}

/** The gaps between the times in `drawn`, in tenths of a millisecond. */
function gaps(drawn: readonly number[]): number[] {
  return drawn.slice(1).map((at, i) => Math.round((at - (drawn[i] ?? 0)) * 10) / 10);
}

describe('RenderLoop, paced', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function paced(hz: number, wanted: () => boolean = () => true) {
    const screen = display(hz);
    const drawn: number[] = [];
    const intervals: (number | null)[] = [];
    const loop: RenderLoop = new RenderLoop(
      (now) => {
        drawn.push(now);
        intervals.push(loop.runInterval);
      },
      screen.scheduler,
      () => screen.state.now,
    );
    const stop = loop.pace(wanted);
    return { ...screen, loop, drawn, intervals, stop };
  }

  it('draws every frame of a 60 Hz display, as one run', () => {
    const { frames, drawn, intervals, loop } = paced(60);
    frames(60);
    expect(drawn).toHaveLength(60);
    expect(new Set(gaps(drawn))).toEqual(new Set([16.7]));
    expect(intervals.slice(1).every((interval) => interval !== null && Math.abs(interval - 1000 / 60) < 0.01)).toBe(
      true,
    );
    expect(loop.paced).toBe(true);
    // Nothing asked for those frames: the room is at rest, however many it draws.
    expect(loop.idle).toBe(true);
  });

  it('draws every other frame of a 120 Hz display, evenly: never a gap of one frame among gaps of two', () => {
    const { frames, drawn } = paced(120);
    frames(240);
    // The first frames are drawn before the display's rate is known.
    const settled = drawn.filter((at) => at > 200);
    expect(settled.length).toBeGreaterThanOrEqual(107);
    expect(settled.length).toBeLessThanOrEqual(109);
    expect(new Set(gaps(settled))).toEqual(new Set([16.7]));
  });

  it.each([
    [75, 75],
    [90, 90],
    [144, 72],
    [240, 80],
  ])('draws a %i Hz display at an even %i frames a second', (hz, rate) => {
    const { frames, drawn } = paced(hz);
    frames(hz * 3);
    const settled = drawn.filter((at) => at > 1000);
    expect(Math.abs(settled.length - rate * 2)).toBeLessThanOrEqual(1);
    const gap = Math.round((1000 / rate) * 10) / 10;
    expect(gaps(settled).every((value) => Math.abs(value - gap) <= 0.1)).toBe(true);
    expect(1000 / rate).toBeGreaterThanOrEqual(PACED_MIN_INTERVAL_MS);
  });

  it('draws a one-off request with the next paced frame, not in a frame of its own between two', () => {
    const { frames, drawn, loop } = paced(120);
    frames(120);
    const before = drawn.length;
    // The lava, the air, a pointer move, the game's own frames: asked for at every display frame.
    frames(120, () => {
      loop.invalidate();
      loop.invalidate(true);
    });
    expect(drawn.length - before).toBe(60);
    expect(new Set(gaps(drawn.slice(before)))).toEqual(new Set([16.7]));
  });

  it('draws an animation on the paced frames, in step with the frames before and after it', () => {
    const { frames, drawn, loop } = paced(120);
    frames(120);
    const from = drawn.length;
    const stepped: number[] = [];
    loop.animate((now) => {
      stepped.push(now);
      return stepped.length < 30;
    });
    // Thirty steps take sixty frames of a 120 Hz display: a flight draws sixty a second there.
    frames(60);
    expect(stepped).toHaveLength(30);
    expect(new Set(gaps(stepped))).toEqual(new Set([16.7]));
    frames(60);
    // One even run, into the animation and out of it: never a gap of one display frame.
    expect(new Set(gaps(drawn.slice(from - 1)))).toEqual(new Set([16.7]));
    expect(loop.animating).toBe(false);
  });

  it('draws an animation on every display frame while it is not paced (before the room is lit)', () => {
    const { frames, drawn, loop, stop } = paced(120);
    frames(120);
    stop();
    const from = drawn.length;
    let left = 30;
    loop.animate(() => --left > 0);
    frames(30);
    expect(drawn.length - from).toBe(30);
  });

  it('runs the riders in every frame drawn, and never draws one for them', () => {
    const { frames, drawn, loop } = paced(120);
    const rode: number[] = [];
    const stop = loop.ride((now) => {
      rode.push(now);
      return true;
    });
    frames(120);
    expect(rode).toEqual(drawn);
    stop();
    frames(12);
    expect(rode.length).toBeLessThan(drawn.length);

    // On a loop that only draws on demand a rider asks for nothing, and rides what comes.
    const idle = display(60);
    const quiet = new RenderLoop(() => {}, idle.scheduler);
    let rides = 0;
    quiet.ride(() => ++rides < 2);
    idle.frames(5);
    expect(quiet.framesRendered).toBe(0);
    quiet.invalidate();
    idle.frames(1);
    quiet.invalidate();
    idle.frames(1);
    quiet.invalidate();
    idle.frames(1);
    // It rode two frames and left with the second (it returned false).
    expect(rides).toBe(2);
  });

  it('draws nothing while it is not wanted but what is asked for, and looks again four times a second', () => {
    vi.useFakeTimers();
    let visible = true;
    const { frames, drawn, loop, pending } = paced(60, () => visible);
    frames(10);
    expect(drawn).toHaveLength(10);
    visible = false;
    frames(10);
    // The frame already asked for found the room hidden and drew nothing; no display frame is watched after it.
    expect(drawn).toHaveLength(10);
    expect(pending()).toBe(0);
    // A resize, a context restored: drawn on demand, as a loop that is not paced draws.
    loop.invalidate();
    frames(1);
    expect(drawn).toHaveLength(11);
    frames(5);
    expect(drawn).toHaveLength(11);
    vi.advanceTimersByTime(600);
    expect(pending()).toBe(0);
    visible = true;
    vi.advanceTimersByTime(250);
    frames(10);
    expect(drawn.length).toBeGreaterThanOrEqual(20);
  });

  it('stops pacing when told to, and on dispose', () => {
    vi.useFakeTimers();
    const { frames, drawn, loop, stop, pending } = paced(60);
    frames(5);
    stop();
    frames(5);
    expect(drawn).toHaveLength(5);
    expect(loop.paced).toBe(false);
    expect(pending()).toBe(0);
    const other = paced(60, () => false);
    other.frames(2);
    other.loop.dispose();
    vi.advanceTimersByTime(1000);
    expect(other.pending()).toBe(0);
  });
});

describe('RenderLoop, at rest', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A paced loop on a display of `hz` that may rest while `state.rest`, with one thing moving at `state.rate`. */
  function resting(hz: number, rate = 30) {
    const screen = display(hz);
    const state = { rest: true, rate, visible: true };
    const drawn: number[] = [];
    const intervals: (number | null)[] = [];
    const loop: RenderLoop = new RenderLoop(
      (now) => {
        drawn.push(now);
        intervals.push(loop.runInterval);
      },
      screen.scheduler,
      () => screen.state.now,
    );
    loop.pace(
      () => state.visible,
      () => state.rest,
    );
    const still = loop.ambient('air', () => state.rate);
    /** The frames drawn a second and their gaps, over `seconds` once the display's rate is known. */
    const measure = (seconds = 2): { rate: number; gaps: Set<number> } => {
      screen.frames(hz);
      const from = drawn.length;
      screen.frames(hz * seconds);
      return { rate: (drawn.length - from) / seconds, gaps: new Set(gaps(drawn.slice(from))) };
    };
    return { ...screen, clock: screen.state, loop, drawn, intervals, state, still, measure };
  }

  it.each([
    // display, asked for, drawn, gap (ms)
    [60, 30, 30, 33.3],
    [60, 24, 30, 33.3],
    [60, 20, 20, 50],
    [60, 60, 60, 16.7],
    [90, 30, 30, 33.3],
    [120, 30, 30, 33.3],
    [120, 24, 24, 41.7],
    [144, 30, 36, 27.8],
    [240, 30, 30, 33.3],
    // A display capped at thirty (Low Power Mode) has no slower even pace above twenty.
    [30, 30, 30, 33.3],
    [30, 20, 30, 33.3],
    [30, 15, 15, 66.7],
  ])('on a %i Hz display what needs %i frames a second gets an even %i', (hz, asked, rate, gap) => {
    const { measure, intervals } = resting(hz, asked);
    const measured = measure();
    expect(Math.abs(measured.rate - rate)).toBeLessThanOrEqual(0.5);
    expect([...measured.gaps].every((value) => Math.abs(value - gap) <= 0.1)).toBe(true);
    // None of them a run's frame: they came when they were due, whatever the device took over the one before.
    if (rate < Math.min(hz, 60)) expect(intervals.slice(-rate).every((interval) => interval === null)).toBe(true);
  });

  it('takes a display a hair under sixty for sixty: thirty are every other frame, not every one', () => {
    const { measure } = resting(59.94, 30);
    expect(Math.abs(measure().rate - 29.97)).toBeLessThanOrEqual(0.5);
  });

  it('draws for whichever of several things needs the most, and for none that is still', () => {
    const { loop, measure, state } = resting(60, 20);
    let discs = 30;
    const stop = loop.ambient('discs', () => discs);
    expect(loop.pacing).toEqual({ pace: 'rest', moving: ['air', 'discs'], rate: 30 });
    expect(measure().rate).toBe(30);
    discs = 0;
    expect(loop.pacing).toEqual({ pace: 'rest', moving: ['air'], rate: 20 });
    expect(measure().rate).toBe(20);
    discs = 30;
    stop();
    expect(measure().rate).toBe(20);
    state.rest = false;
    expect(loop.pacing).toEqual({ pace: 'full', moving: ['air'], rate: 20 });
  });

  it('draws nothing and watches no display frame while nothing moves, and finds within a quarter second that something does', () => {
    vi.useFakeTimers();
    const { frames, drawn, state, pending, loop } = resting(60, 0);
    frames(30);
    // The frame the pacing asked for found nothing to draw.
    expect(drawn).toHaveLength(0);
    expect(pending()).toBe(0);
    expect(loop.pacing).toEqual({ pace: 'still', moving: [], rate: 0 });
    vi.advanceTimersByTime(1000);
    expect(pending()).toBe(0);
    state.rate = 30;
    vi.advanceTimersByTime(250);
    expect(pending()).toBe(1);
    frames(60);
    expect(drawn).toHaveLength(30);
    // And stops again when it stops.
    state.rate = 0;
    frames(4);
    const stopped = drawn.length;
    frames(60);
    expect(drawn).toHaveLength(stopped);
    expect(pending()).toBe(0);
  });

  it('draws what is asked for with the next full-pace frame, however long the rest', () => {
    for (const hz of [60, 120]) {
      const { frames, drawn, loop, state, clock } = resting(hz, 0);
      // A room in which nothing moves, then a pointer's move: the very next display frame.
      frames(hz);
      expect(drawn).toHaveLength(0);
      loop.invalidate();
      frames(1);
      expect(drawn).toHaveLength(1);
      // And at rest at thirty a second: what is asked for right after a rest frame is drawn one full-pace frame after
      // it, on a 120 Hz display the second display frame.
      state.rate = 30;
      loop.invalidate();
      frames(hz);
      while (drawn.at(-1) !== clock.now) frames(1);
      const last = drawn.at(-1) ?? 0;
      loop.invalidate();
      frames(hz / 60);
      expect(Math.round(((drawn.at(-1) ?? 0) - last) * 10) / 10).toBe(16.7);
    }
  });

  it('gives a flight every full-pace frame from its first, as a run from its second, and rests again after it', () => {
    const { frames, drawn, intervals, loop } = resting(120, 30);
    frames(240);
    const from = drawn.length;
    const stepped: number[] = [];
    loop.animate((now) => {
      stepped.push(now);
      return stepped.length < 30;
    });
    frames(60);
    expect(stepped).toHaveLength(30);
    expect(new Set(gaps(stepped))).toEqual(new Set([16.7]));
    // The first frame follows a rest frame (not a run's); every one after it is a run's.
    expect(intervals[from]).toBeNull();
    expect(
      intervals
        .slice(from + 1, from + 30)
        .every((interval) => interval !== null && Math.abs(interval - 1000 / 60) < 0.01),
    ).toBe(true);
    frames(120);
    const after = drawn.slice(from + 30);
    expect(new Set(gaps(after))).toEqual(new Set([33.3]));
    expect(intervals.slice(from + 30).every((interval) => interval === null)).toBe(true);
  });

  it('draws every paced frame as a run while it may not rest, and no rest frame counts as one when it may again', () => {
    const { frames, drawn, intervals, state } = resting(60, 30);
    state.rest = false;
    frames(60);
    expect(drawn).toHaveLength(60);
    expect(intervals.slice(1).every((interval) => interval !== null)).toBe(true);
    state.rest = true;
    const from = drawn.length;
    frames(60);
    expect(drawn.length - from).toBe(30);
    expect(intervals.slice(from).every((interval) => interval === null)).toBe(true);
    // Back to full pace: the first frame follows a rest frame and is not a run's.
    state.rest = false;
    const again = drawn.length;
    frames(10);
    expect(intervals[again]).toBeNull();
    expect(intervals.slice(again + 1).every((interval) => interval !== null)).toBe(true);
  });

  it('draws the game on the TV at full pace as a run, each frame asked for as the one before it is shown', () => {
    const { frames, drawn, intervals, loop } = resting(60, 0);
    frames(60, () => loop.invalidate(true));
    expect(drawn).toHaveLength(60);
    expect(intervals.slice(2).every((interval) => interval !== null && Math.abs(interval - 1000 / 60) < 0.01)).toBe(
      true,
    );
  });

  it('draws nothing while it is not wanted, whatever moves', () => {
    vi.useFakeTimers();
    const { frames, drawn, state, pending } = resting(60, 30);
    frames(10);
    state.visible = false;
    frames(10);
    const hidden = drawn.length;
    vi.advanceTimersByTime(2000);
    frames(60);
    expect(drawn).toHaveLength(hidden);
    expect(pending()).toBe(0);
  });

  it('draws for what moves by itself on a loop that is not paced too (before the room is lit)', () => {
    const screen = display(60);
    const loop = new RenderLoop(
      () => {},
      screen.scheduler,
      () => screen.state.now,
    );
    let rate = 30;
    loop.ambient('lava', () => rate);
    screen.frames(120);
    expect(Math.abs(loop.framesRendered - 60)).toBeLessThanOrEqual(1);
    rate = 0;
    screen.frames(4);
    const stopped = loop.framesRendered;
    screen.frames(60);
    expect(loop.framesRendered).toBe(stopped);
    expect(screen.pending()).toBe(0);
    // Started again by a frame asked for: whatever begins to move asks for one.
    rate = 30;
    loop.invalidate();
    screen.frames(60);
    expect(loop.framesRendered - stopped).toBeGreaterThanOrEqual(29);
  });
});
