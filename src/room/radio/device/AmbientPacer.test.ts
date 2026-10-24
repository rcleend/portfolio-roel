import { describe, expect, it } from 'vitest';
import { AMBIENT_INTERVAL_MS, AmbientPacer } from './AmbientPacer';

function fakeTime() {
  let now = 0;
  const timers: { at: number; run: () => void }[] = [];
  return {
    now: () => now,
    setTimer: (run: () => void, ms: number) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle: unknown) => {
      timers.splice(timers.indexOf(handle as never), 1);
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((x, y) => x.at - y.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = next.at;
        next.run();
      }
      now = end;
    },
  };
}

describe('AmbientPacer', () => {
  it('asks for at most 30 frames a second while wanted, then rests', () => {
    const time = fakeTime();
    let wanted = true;
    let frames = 0;
    let last = Number.NEGATIVE_INFINITY;
    const pacer = new AmbientPacer({
      wanted: () => wanted,
      lastFrame: () => last,
      now: time.now,
      frame: () => {
        frames++;
        last = time.now();
      },
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    pacer.sync();
    expect(pacer.running).toBe(true);
    time.advance(1000);
    expect(frames).toBeLessThanOrEqual(31);
    expect(frames).toBeGreaterThanOrEqual(29);
    wanted = false;
    time.advance(AMBIENT_INTERVAL_MS);
    expect(pacer.running).toBe(false);
    const rested = frames;
    time.advance(2000);
    expect(frames).toBe(rested);
  });

  it('skips its frame when another cause drew one in the last 30 ms', () => {
    const time = fakeTime();
    let frames = 0;
    const pacer = new AmbientPacer({
      wanted: () => true,
      // Frames at 60/s for another reason (a choreography step).
      lastFrame: () => time.now() - 5,
      now: time.now,
      frame: () => frames++,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    pacer.sync();
    time.advance(1000);
    expect(frames).toBe(0);
    pacer.stop();
    expect(pacer.running).toBe(false);
  });

  it('never starts when not wanted (hidden stage, reduced motion, slow tier, not at the radio)', () => {
    const time = fakeTime();
    const pacer = new AmbientPacer({
      wanted: () => false,
      lastFrame: () => 0,
      now: time.now,
      frame: () => {
        throw new Error('no frame');
      },
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    pacer.sync();
    time.advance(500);
    expect(pacer.running).toBe(false);
  });
});
