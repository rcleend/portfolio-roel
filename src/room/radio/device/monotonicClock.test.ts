import { describe, expect, it } from 'vitest';
import { eventTime, MonotonicClock } from './monotonicClock';

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

describe('eventTime', () => {
  it('stamps an event with the last frame drawn, so the frame that follows is never held to the event', () => {
    // A 120 Hz display: frames at 1000, 1008.3, …; a pointer move handled 1.2 ms into the frame at 1008.3.
    const stamped = eventTime(1009.5, 1000);
    expect(stamped).toBe(1000);
    const clock = new MonotonicClock();
    clock.at(stamped);
    // The frame draws at its own time, and the next one a whole frame later: even steps.
    expect(clock.at(1008.3)).toBe(1008.3);
    expect(clock.at(1016.6)).toBe(1016.6);
  });

  it('never stamps an event more than a 60 Hz frame back, however long ago the last frame was drawn', () => {
    expect(eventTime(5000, 1000)).toBeCloseTo(5000 - 1000 / 60);
    expect(eventTime(5000, Number.NEGATIVE_INFINITY)).toBeCloseTo(5000 - 1000 / 60);
  });

  it('never stamps an event later than now', () => {
    expect(eventTime(1000, 1004)).toBe(1000);
  });
});
