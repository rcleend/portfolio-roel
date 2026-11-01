import { describe, expect, it } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { type ActionState, IDLE_POINTER, InputSnapshot, type PointerSnapshot } from '@/engine/input/InputSnapshot';
import { arcadeFont } from '../../../art/fonts/arcade';
import { smallFont } from '../../../art/fonts/small';
import { createTextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { ControlHints, HINTS, type HintAction } from './controlHints';

const small = BitmapFont.fromGlyphData(smallFont);
const text = createTextStyles({ small, label: small, arcade: BitmapFont.fromGlyphData(arcadeFont) });
const HELD: ActionState = { down: true, pressed: false, released: false };
/** A row through the middle of the strip. */
const ROW = 230;

function input(pointer: Partial<PointerSnapshot> = {}, held: readonly Action[] = []): InputSnapshot<Action> {
  return new InputSnapshot<Action>(
    new Map(held.map((action) => [action, HELD])),
    { ...IDLE_POINTER, over: true, ...pointer },
    'pointer',
  );
}

/** The strip's keys left to right, as a pointer sweeping the row finds them, with a point on each. */
function sweep(hints: ControlHints, device: 'keyboard' | 'touch' = 'keyboard') {
  const keys: { action: HintAction; x: number }[] = [];
  for (let x = 0; x < 320; x++) {
    const action = hints.hitTest(x, ROW, device);
    if (action && keys.at(-1)?.action !== action) keys.push({ action, x });
  }
  return keys;
}

function at(hints: ControlHints, action: HintAction): number {
  const key = sweep(hints).find((candidate) => candidate.action === action);
  if (!key) throw new Error(`no ${action} key`);
  return key.x + 2;
}

describe('ControlHints', () => {
  it('takes the bottom rows once it shows, and only those', () => {
    const hints = new ControlHints(text);
    expect(hints.covers(235, HINTS.from - 0.1)).toBe(false);
    expect(hints.covers(235, HINTS.from)).toBe(true);
    expect(hints.covers(221, HINTS.from)).toBe(true);
    expect(hints.covers(220, HINTS.from)).toBe(false);
  });

  it('is a row of keys: MOVE left and right, JUMP, ATTACK, both SKILLS and PAUSE', () => {
    const hints = new ControlHints(text);
    expect(sweep(hints).map((key) => key.action)).toEqual([
      'left',
      'right',
      'jump',
      'attack',
      'skill1',
      'skill2',
      'pause',
    ]);
  });

  it('presses a key under the mouse and holds it while the button is held on it', () => {
    const hints = new ControlHints(text);
    const x = at(hints, 'jump');
    expect(hints.update(input({ x, y: ROW }), 'keyboard', true).held.size).toBe(0);
    expect(hints.state('jump')).toBe('hover');
    const pressed = hints.update(input({ x, y: ROW, down: true, pressed: true }), 'keyboard', true);
    expect([...pressed.pressed]).toEqual(['jump']);
    expect([...pressed.held]).toEqual(['jump']);
    expect(hints.state('jump')).toBe('pressed');
    const held = hints.update(input({ x, y: ROW, down: true }), 'keyboard', true);
    expect([...held.pressed]).toEqual([]);
    expect([...held.held]).toEqual(['jump']);
    const released = hints.update(input({ x, y: ROW, released: true }), 'keyboard', true);
    expect(released.held.size + released.pressed.size).toBe(0);
    expect(hints.state('jump')).toBe('hover');
  });

  it('lets go of a key the mouse slides off, like a finger off a button', () => {
    const hints = new ControlHints(text);
    hints.update(input({ x: at(hints, 'right'), y: ROW, down: true, pressed: true }), 'keyboard', true);
    const slid = hints.update(input({ x: at(hints, 'attack'), y: ROW, down: true }), 'keyboard', true);
    expect(slid.held.size).toBe(0);
    expect(hints.state('right')).toBe('normal');
  });

  it('sinks the key of a real key held down, and lights nothing for a finger or while hidden', () => {
    const hints = new ControlHints(text);
    hints.update(input({}, ['attack']), 'keyboard', true);
    expect(hints.state('attack')).toBe('pressed');
    const x = at(hints, 'pause');
    const touched = hints.update(input({ x, y: ROW, down: true, pressed: true, kind: 'touch' }), 'keyboard', true);
    expect(touched.pressed.size).toBe(0);
    expect(hints.state('pause')).toBe('normal');
    const hidden = hints.update(input({ x, y: ROW, down: true, pressed: true }), 'keyboard', false);
    expect(hidden.pressed.size).toBe(0);
  });

  it('splits the touch pad d-pad down the middle between left and right', () => {
    const hints = new ControlHints(text);
    const actions = sweep(hints, 'touch').map((key) => key.action);
    expect(actions.slice(0, 2)).toEqual(['left', 'right']);
  });
});
