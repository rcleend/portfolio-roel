import { describe, expect, it } from 'vitest';
import { AmbientPacer } from './AmbientPacer';

/**
 * A display that shows a frame every `hz`-th of a second, and the room's render loop on it: animation frame
 * callbacks run at each display frame in the order they were asked for, and a draw asked for during one display
 * frame happens on the next (that is when the browser runs the loop's callback). `work` is how late, after the
 * display frame, the callbacks get to run (a busy main thread), and `tick` jitters the display frame times a little.
 */
function display(hz: number, options: { readonly work?: number; readonly jitter?: number } = {}) {
  const period = 1000 / hz;
  let index = 0;
  let callbacks: ((now: number) => void)[] = [];
  let drawRequested = false;
  let lastDrawn = Number.NEGATIVE_INFINITY;
  const drawn: number[] = [];
  const timeOf = (frame: number) =>
    frame * period + (options.jitter ?? 0) * Math.sin(frame * 12.9898) + (options.work ?? 0);
  const request = (callback: (now: number) => void) => {
    callbacks.push(callback);
    return callback;
  };
  return {
    drawn,
    request,
    cancel: (handle: unknown) => {
      callbacks = callbacks.filter((callback) => callback !== handle);
    },
    lastFrame: () => lastDrawn,
    /** The render loop's invalidate: draw on the next display frame. */
    invalidate: () => {
      drawRequested = true;
    },
    /** The display frames of the next `ms` pass with no callback run (a blocked main thread). */
    skip(ms: number) {
      index += Math.round(ms / period);
    },
    run(ms: number) {
      const end = ms / period;
      for (; index < end; index++) {
        const now = timeOf(index);
        // The loop's own callback (asked for in the previous frame) runs first, then whoever asked after it.
        if (drawRequested) {
          drawRequested = false;
          lastDrawn = now;
          drawn.push(now);
        }
        const due = callbacks;
        callbacks = [];
        for (const callback of due) callback(now);
      }
    },
  };
}

function pacerOn(screen: ReturnType<typeof display>, wanted: () => boolean = () => true) {
  return new AmbientPacer({
    wanted,
    lastFrame: screen.lastFrame,
    frame: screen.invalidate,
    request: screen.request,
    cancel: screen.cancel,
  });
}

const fps = (drawn: readonly number[], from: number, to: number) =>
  drawn.filter((t) => t >= from && t < to).length / ((to - from) / 1000);
const gaps = (drawn: readonly number[]) => drawn.slice(1).map((t, i) => t - (drawn[i] ?? 0));

describe('AmbientPacer', () => {
  it.each([60, 120, 90, 144])('draws the drift at %i Hz on the frames that reach a 30-a-second grid', (hz) => {
    const screen = display(hz, { jitter: 0.15 });
    pacerOn(screen).sync();
    screen.run(5000);
    expect(fps(screen.drawn, 1000, 5000)).toBeCloseTo(30, 0);
    // Steady: about one interval, never a skipped frame's double gap.
    expect(Math.max(...gaps(screen.drawn).slice(1))).toBeLessThan(1000 / 30 + 1000 / hz);
  });

  it('draws every second frame of a 60 Hz display, evenly', () => {
    const screen = display(60, { jitter: 0.15 });
    pacerOn(screen).sync();
    screen.run(2000);
    for (const gap of gaps(screen.drawn)) expect(gap).toBeCloseTo(1000 / 30, 0);
  });

  it('never goes over 30 a second, whatever the display, in any second', () => {
    // 62.5 Hz is the display of Playwright's fake clock (a frame every 16 ms): every second frame would be 31.25.
    for (const hz of [60, 62.5, 75, 90, 100, 120, 144, 165, 240]) {
      const screen = display(hz);
      pacerOn(screen).sync();
      screen.run(5000);
      expect(fps(screen.drawn, 500, 5000)).toBeLessThanOrEqual(30.25);
      expect(fps(screen.drawn, 500, 5000)).toBeGreaterThanOrEqual(28);
      for (let from = 0; from < 4000; from += 37) {
        expect(screen.drawn.filter((t) => t >= from && t < from + 1000).length).toBeLessThanOrEqual(31);
      }
    }
  });

  it('follows a stall with one interval, not a burst catching up', () => {
    const screen = display(60);
    pacerOn(screen).sync();
    screen.run(1000);
    // The main thread is blocked for 300 ms: no display frame runs the callbacks.
    const before = screen.drawn.length;
    screen.skip(300);
    screen.run(1600);
    const after = screen.drawn.slice(before);
    expect(Math.min(...gaps(after))).toBeGreaterThanOrEqual(1000 / 30 - 1);
  });

  it('keeps 30 a second when the main thread runs the frame callbacks late', () => {
    const screen = display(60, { work: 12 });
    pacerOn(screen).sync();
    screen.run(4000);
    expect(fps(screen.drawn, 1000, 4000)).toBeCloseTo(30, 0);
  });

  it('adds nothing while frames are drawn for another reason', () => {
    const screen = display(60);
    const pacer = pacerOn(screen);
    pacer.sync();
    // Something else (a spring) draws every display frame: the drift rides along.
    const busy = () => {
      screen.invalidate();
      screen.request(busy);
    };
    screen.request(busy);
    screen.run(1000);
    expect(fps(screen.drawn, 200, 1000)).toBeCloseTo(60, 0);
    pacer.stop();
    expect(pacer.running).toBe(false);
  });

  it('stops watching the display when no longer wanted, and never starts when not wanted', () => {
    let wanted = true;
    const screen = display(60);
    const pacer = pacerOn(screen, () => wanted);
    pacer.sync();
    screen.run(1000);
    wanted = false;
    screen.run(1100);
    expect(pacer.running).toBe(false);
    const rested = screen.drawn.length;
    screen.run(3000);
    expect(screen.drawn).toHaveLength(rested);
    const idle = display(60);
    const never = pacerOn(idle, () => false);
    never.sync();
    idle.run(500);
    expect(never.running).toBe(false);
    expect(idle.drawn).toHaveLength(0);
  });
});
