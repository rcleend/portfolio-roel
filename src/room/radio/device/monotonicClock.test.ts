import { describe, expect, it } from 'vitest';
import { MonotonicClock } from './monotonicClock';

describe('MonotonicClock', () => {
  it('passes times through while they rise', () => {
    const clock = new MonotonicClock();
    expect([clock.at(10), clock.at(20), clock.at(20.5)]).toEqual([10, 20, 20.5]);
  });

  it('draws a frame stamped before an event already handled at the event', () => {
    const clock = new MonotonicClock();
    const event = clock.at(1000); // a leave, stamped with performance.now()
    expect(clock.at(996)).toBe(event); // the next frame's earlier requestAnimationFrame timestamp
    expect(clock.at(1012)).toBe(1012);
  });
});
