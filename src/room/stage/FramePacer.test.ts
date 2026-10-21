import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FramePacer } from './FramePacer';

describe('FramePacer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const present = vi.fn();
    const pacer = new FramePacer(15, present, () => Date.now());
    return { present, pacer };
  };

  it('presents frames that are far enough apart immediately', () => {
    const { present, pacer } = make();
    pacer.frame();
    vi.advanceTimersByTime(17);
    pacer.frame();
    expect(present).toHaveBeenCalledTimes(2);
  });

  it('presents a 120 Hz stream at most once per interval, never losing the last frame', () => {
    const { present, pacer } = make();
    for (let i = 0; i < 12; i++) {
      pacer.frame();
      vi.advanceTimersByTime(8);
    }
    vi.advanceTimersByTime(50);
    // 96 ms of frames at a 15 ms cap: 7 presents, the last one after the stream stopped.
    expect(present).toHaveBeenCalledTimes(7);
  });

  it('drops a pending present on dispose', () => {
    const { present, pacer } = make();
    pacer.frame();
    pacer.frame();
    pacer.dispose();
    vi.advanceTimersByTime(100);
    expect(present).toHaveBeenCalledTimes(1);
  });
});
