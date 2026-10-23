import { describe, expect, it } from 'vitest';
import { LaneError, parseLane, parseToken } from './lane';

describe('parseToken', () => {
  it('reads notes with slides, intervals and velocity', () => {
    expect(parseToken('C4', 'melodic')).toEqual({ kind: 'note', midi: 60, velocity: 1, slide: false, intervals: [] });
    expect(parseToken('~Bb3:4', 'melodic')).toEqual({
      kind: 'note',
      midi: 58,
      velocity: 0.5,
      slide: true,
      intervals: [],
    });
    expect(parseToken('C4[47c]', 'melodic')).toMatchObject({ intervals: [0, 4, 7, 12] });
    expect(parseToken('-', 'melodic')).toEqual({ kind: 'off' });
  });

  it('reads kit hits only on kit lanes', () => {
    expect(parseToken('s:2', 'kit')).toEqual({ kind: 'hit', piece: 's', velocity: 0.3 });
    expect(parseToken('hat2', 'kit')).toEqual({ kind: 'hit', piece: 'hat2', velocity: 1 });
    expect(parseToken('C4', 'kit')).toBeNull();
    expect(parseToken('k', 'melodic')).toBeNull();
  });
});

describe('parseLane', () => {
  it('spreads each bar’s tokens evenly across the bar', () => {
    const lane = parseLane('C4 E4 G4 C5 | A3 . . . . . . -', 'melodic', 96);
    expect(lane.bars).toBe(2);
    expect(lane.steps.map((step) => step.tick)).toEqual([0, 24, 48, 72, 96, 180]);
  });

  it('supports triplets and ignores outer bar lines and line breaks', () => {
    const lane = parseLane(
      `| C4 D4 E4
       | F4 . |`,
      'melodic',
      96,
    );
    expect(lane.bars).toBe(2);
    expect(lane.steps.map((step) => step.tick)).toEqual([0, 32, 64, 96]);
  });

  it('names the bar and token when something is wrong', () => {
    expect(() => parseLane('C4 . . | C4 C4 C4 C4 C4', 'melodic', 96, 'title.lead')).toThrow(
      'title.lead, bar 2: 5 tokens do not divide a bar of 96 ticks',
    );
    expect(() => parseLane('C4 H4', 'melodic', 96, 'x')).toThrow(LaneError);
    expect(() => parseLane('C4 | | C4', 'melodic', 96)).toThrow(/bar 2: 0 tokens/);
  });
});
