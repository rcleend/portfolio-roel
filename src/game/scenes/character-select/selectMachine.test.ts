import { describe, expect, it } from 'vitest';
import { initialSelectState, reduceSelect, reduceSelectAll, type SelectState } from './selectMachine';

const start = (index = 0): SelectState => initialSelectState(3, index);

describe('initialSelectState', () => {
  it('starts on the given character', () => {
    expect(start(2)).toEqual({ index: 2, count: 3, phase: 'browsing' });
  });

  it('wraps an out-of-range start index instead of failing', () => {
    expect(start(4).index).toBe(1);
    expect(start(-1).index).toBe(2);
  });

  it('rejects an empty roster', () => {
    expect(() => initialSelectState(0)).toThrow(RangeError);
  });
});

describe('switching characters', () => {
  it('moves to the next and previous character, wrapping at both ends', () => {
    expect(reduceSelect(start(2), { type: 'switch', delta: 1 }).state.index).toBe(0);
    expect(reduceSelect(start(0), { type: 'switch', delta: -1 }).state.index).toBe(2);
  });

  it('reports where it came from so the card can wipe from the old character', () => {
    const { effects } = reduceSelect(start(1), { type: 'switch', delta: 1 });
    expect(effects).toEqual([{ type: 'switched', delta: 1, from: 1 }]);
  });

  it('does nothing with a single character', () => {
    const solo = initialSelectState(1);
    expect(reduceSelect(solo, { type: 'switch', delta: 1 })).toEqual({ state: solo, effects: [] });
  });
});

describe('choosing and leaving', () => {
  it('commits to the character on screen on confirm', () => {
    const result = reduceSelect(start(1), { type: 'confirm' });
    expect(result.state.phase).toBe('chosen');
    expect(result.effects).toEqual([{ type: 'chosen', index: 1 }]);
  });

  it('commits to the character landed on when switch and confirm arrive in the same step', () => {
    const result = reduceSelectAll(start(0), [{ type: 'switch', delta: 1 }, { type: 'confirm' }]);
    expect(result.effects.at(-1)).toEqual({ type: 'chosen', index: 1 });
  });

  it('goes back on back', () => {
    const result = reduceSelect(start(), { type: 'back' });
    expect(result.state.phase).toBe('leaving');
    expect(result.effects).toEqual([{ type: 'left' }]);
  });

  it('ignores everything once committed, so a choice can never fire twice', () => {
    const chosen = reduceSelect(start(), { type: 'confirm' }).state;
    const later = reduceSelectAll(chosen, [{ type: 'switch', delta: 1 }, { type: 'confirm' }, { type: 'back' }]);
    expect(later).toEqual({ state: chosen, effects: [] });
  });

  it('ignores everything once leaving', () => {
    const leaving = reduceSelect(start(), { type: 'back' }).state;
    expect(reduceSelect(leaving, { type: 'confirm' })).toEqual({ state: leaving, effects: [] });
  });
});
