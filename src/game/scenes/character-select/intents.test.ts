import { describe, expect, it } from 'vitest';
import { type ActionState, IDLE_POINTER, InputSnapshot, type PointerSnapshot } from '@/engine/input/InputSnapshot';
import type { Action } from '../../input/bindings';
import { readSelectEvents } from './intents';
import { ARROW_LEFT_HIT, ARROW_RIGHT_HIT, SELECT_BUTTON, selectLayout } from './layout';

const PRESSED: ActionState = { down: true, pressed: true, released: false };

function input(pressed: readonly Action[] = [], pointer: Partial<PointerSnapshot> = {}): InputSnapshot<Action> {
  return new InputSnapshot<Action>(
    new Map(pressed.map((action) => [action, PRESSED])),
    { ...IDLE_POINTER, ...pointer },
    null,
  );
}

const centre = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const { hitTest, skillRows: SKILL_ROWS } = selectLayout();

describe('readSelectEvents', () => {
  it('reads nothing from idle input', () => {
    expect(readSelectEvents(input(), IDLE_POINTER, hitTest)).toEqual([]);
  });

  it('maps the d-pad to switching and focus moves', () => {
    expect(readSelectEvents(input(['left', 'down']), IDLE_POINTER, hitTest)).toEqual([
      { type: 'switch', delta: -1 },
      { type: 'move', delta: 1 },
    ]);
    expect(readSelectEvents(input(['right', 'up']), IDLE_POINTER, hitTest)).toEqual([
      { type: 'switch', delta: 1 },
      { type: 'move', delta: -1 },
    ]);
  });

  it('orders switching before confirm, so confirm commits to the character landed on', () => {
    expect(readSelectEvents(input(['confirm', 'right']), IDLE_POINTER, hitTest)).toEqual([
      { type: 'switch', delta: 1 },
      { type: 'confirm' },
    ]);
  });

  it('reads back', () => {
    expect(readSelectEvents(input(['back']), IDLE_POINTER, hitTest)).toEqual([{ type: 'back' }]);
  });

  it('switches when an arrow is clicked', () => {
    const left = centre(ARROW_LEFT_HIT);
    const right = centre(ARROW_RIGHT_HIT);
    const press = { over: true, down: true, pressed: true };
    expect(readSelectEvents(input([], { ...left, ...press }), IDLE_POINTER, hitTest)).toEqual([
      { type: 'switch', delta: -1 },
    ]);
    expect(readSelectEvents(input([], { ...right, ...press }), IDLE_POINTER, hitTest)).toEqual([
      { type: 'switch', delta: 1 },
    ]);
  });

  it('focuses what the pointer moves onto', () => {
    const skill = centre(SKILL_ROWS[1]);
    expect(readSelectEvents(input([], { ...skill, over: true }), IDLE_POINTER, hitTest)).toEqual([
      { type: 'point', target: 'skill2', pressed: false },
    ]);
    const button = centre(SELECT_BUTTON);
    expect(readSelectEvents(input([], { ...button, over: true }), IDLE_POINTER, hitTest)).toEqual([
      { type: 'point', target: 'select', pressed: false },
    ]);
  });

  it('marks a press on a focusable element as a tap', () => {
    const skill = { ...centre(SKILL_ROWS[0]), over: true };
    const previous = { ...IDLE_POINTER, ...skill };
    expect(readSelectEvents(input([], { ...skill, down: true, pressed: true }), previous, hitTest)).toEqual([
      { type: 'point', target: 'skill1', pressed: true },
    ]);
  });

  it('does not let a resting pointer steal focus back from the keyboard', () => {
    const skill = { ...centre(SKILL_ROWS[0]), over: true };
    const previous = { ...IDLE_POINTER, ...skill };
    expect(readSelectEvents(input(['down'], skill), previous, hitTest)).toEqual([{ type: 'move', delta: 1 }]);
  });

  it('ignores a pointer that is off the screen', () => {
    const skill = centre(SKILL_ROWS[0]);
    expect(readSelectEvents(input([], { ...skill, over: false }), IDLE_POINTER, hitTest)).toEqual([]);
  });
});

describe('hitTest', () => {
  it('finds every interactive area and nothing in the gaps', () => {
    expect(hitTest(centre(ARROW_LEFT_HIT).x, centre(ARROW_LEFT_HIT).y)).toBe('arrowLeft');
    expect(hitTest(centre(ARROW_RIGHT_HIT).x, centre(ARROW_RIGHT_HIT).y)).toBe('arrowRight');
    expect(hitTest(80, 100)).toBe('card');
    expect(hitTest(centre(SKILL_ROWS[0]).x, centre(SKILL_ROWS[0]).y)).toBe('skill1');
    expect(hitTest(centre(SELECT_BUTTON).x, centre(SELECT_BUTTON).y)).toBe('select');
    expect(hitTest(319, 0)).toBeNull();
  });

  it("grows the skill rows with a look's bigger icons and keeps SELECT reachable beside them", () => {
    const tall = selectLayout(30);
    const [first, second] = tall.skillRows;
    expect(first).toMatchObject({ y: SKILL_ROWS[0].y, h: 30 });
    expect(second.y).toBe(first.y + 32);
    expect(tall.hitTest(centre(second).x, centre(second).y)).toBe('skill2');
    expect(tall.hitTest(SELECT_BUTTON.x + 2, SELECT_BUTTON.y + 2)).toBe('select');
  });
});
