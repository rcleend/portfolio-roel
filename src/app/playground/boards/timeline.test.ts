import { describe, expect, it } from 'vitest';
import { beatAt, framesUntil, positionOn, type Timeline } from './timeline';

describe('framesUntil', () => {
  it('finds the frame a scene clock reaches a time on, drift included', () => {
    expect(framesUntil(0)).toBe(0);
    expect(framesUntil(1 / 60)).toBe(1);
    expect(framesUntil(1.25)).toBe(75);
    // 87 steps of 1/60 s add up to just under 1.45 s.
    expect(framesUntil(1.45)).toBe(88);
  });
});

describe('beatAt', () => {
  const timeline: Timeline = {
    frames: 100,
    loops: false,
    beats: [
      { frame: 0, label: 'hit' },
      { frame: 40, label: 'slide' },
      { frame: 60, label: 'settled' },
    ],
  };

  it('names the beat a frame falls in, up to the end of the timeline', () => {
    expect(beatAt(timeline, 0)?.label).toBe('hit');
    expect(beatAt(timeline, 39)?.label).toBe('hit');
    expect(beatAt(timeline, 40)?.label).toBe('slide');
    expect(beatAt(timeline, 100)?.label).toBe('settled');
    expect(beatAt(timeline, 101)).toBeNull();
  });

  it('follows a looping scene round and round', () => {
    const loop: Timeline = { ...timeline, loops: true };
    expect(positionOn(loop, 250)).toBe(50);
    expect(beatAt(loop, 250)?.label).toBe('slide');
    expect(positionOn(timeline, 250)).toBe(100);
  });
});
