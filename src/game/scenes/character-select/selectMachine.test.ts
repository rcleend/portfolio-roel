import { describe, expect, it } from 'vitest';
import {
  FOCUS_ORDER,
  focusedSkillSlot,
  initialSelectState,
  reduceSelect,
  reduceSelectAll,
  type SelectState,
} from './selectMachine';

const start = (index = 0): SelectState => initialSelectState(3, index);

describe('initialSelectState', () => {
  it('starts on the given character with the card focused', () => {
    expect(start(2)).toEqual({ index: 2, count: 3, focus: 'card', focusSource: 'nav', phase: 'browsing' });
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

  it('keeps focus where it is, so an open skill tooltip follows the new character', () => {
    const onSkill = { ...start(), focus: 'skill2' as const };
    expect(reduceSelect(onSkill, { type: 'switch', delta: 1 }).state.focus).toBe('skill2');
  });

  it('does nothing with a single character', () => {
    const solo = initialSelectState(1);
    expect(reduceSelect(solo, { type: 'switch', delta: 1 })).toEqual({ state: solo, effects: [] });
  });
});

describe('moving focus', () => {
  it('walks card → skill 1 → skill 2 → SELECT and wraps', () => {
    let state = start();
    const visited = [state.focus];
    for (let i = 0; i < FOCUS_ORDER.length; i++) {
      state = reduceSelect(state, { type: 'move', delta: 1 }).state;
      visited.push(state.focus);
    }
    expect(visited).toEqual(['card', 'skill1', 'skill2', 'select', 'card']);
    expect(reduceSelect(start(), { type: 'move', delta: -1 }).state.focus).toBe('select');
  });

  it('marks keyboard focus as sticky and announces the move', () => {
    const result = reduceSelect({ ...start(), focusSource: 'hover' }, { type: 'move', delta: 1 });
    expect(result.state.focusSource).toBe('nav');
    expect(result.effects).toEqual([{ type: 'focused', target: 'skill1' }]);
  });

  it('lets the pointer take focus by hovering', () => {
    const result = reduceSelect(start(), { type: 'point', target: 'skill2', pressed: false });
    expect(result.state).toMatchObject({ focus: 'skill2', focusSource: 'hover' });
    expect(result.effects).toEqual([{ type: 'focused', target: 'skill2' }]);
  });

  it('pins focus when an element is tapped, so lifting the finger keeps the tooltip open', () => {
    const result = reduceSelect(start(), { type: 'point', target: 'skill1', pressed: true });
    expect(result.state).toMatchObject({ focus: 'skill1', focusSource: 'tap' });
  });

  it('changes how existing focus is held without announcing a move', () => {
    const onSkill = { ...start(), focus: 'skill1' as const };
    const result = reduceSelect(onSkill, { type: 'point', target: 'skill1', pressed: false });
    expect(result.state.focusSource).toBe('hover');
    expect(result.effects).toEqual([]);
  });
});

describe('choosing and leaving', () => {
  it.each(FOCUS_ORDER)('commits on confirm while %s has focus', (focus) => {
    const result = reduceSelect({ ...start(1), focus }, { type: 'confirm' });
    expect(result.state.phase).toBe('chosen');
    expect(result.effects).toEqual([{ type: 'chosen', index: 1 }]);
  });

  it('commits when SELECT is clicked', () => {
    expect(reduceSelect(start(2), { type: 'activate' }).effects).toEqual([{ type: 'chosen', index: 2 }]);
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
    const later = reduceSelectAll(chosen, [
      { type: 'switch', delta: 1 },
      { type: 'move', delta: 1 },
      { type: 'confirm' },
      { type: 'activate' },
      { type: 'back' },
    ]);
    expect(later).toEqual({ state: chosen, effects: [] });
  });

  it('ignores everything once leaving', () => {
    const leaving = reduceSelect(start(), { type: 'back' }).state;
    expect(reduceSelect(leaving, { type: 'confirm' })).toEqual({ state: leaving, effects: [] });
  });
});

describe('focusedSkillSlot', () => {
  it('maps the skill targets to their slot and everything else to null', () => {
    expect(FOCUS_ORDER.map(focusedSkillSlot)).toEqual([null, 0, 1, null]);
  });
});
