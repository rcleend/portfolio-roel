import { describe, expect, it } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { type ActionState, IDLE_POINTER, InputSnapshot, type PointerSnapshot } from '@/engine/input/InputSnapshot';
import { smallFont } from '../../art/fonts/small';
import type { Action } from '../../input/bindings';
import { KeyHints } from '../../ui/KeyHints';
import { readSelectEvents } from './intents';
import { ARROW_LEFT_HIT, ARROW_RIGHT_HIT, CARD, KEY_HINTS, NAME_ROW, SKILL_NAME_HEIGHT, selectLayout } from './layout';

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
    expect(readSelectEvents(input(), hitTest)).toEqual([]);
  });

  it('maps left/right to switching, and up/down to nothing: the skills are no stop', () => {
    expect(readSelectEvents(input(['left']), hitTest)).toEqual([{ type: 'switch', delta: -1 }]);
    expect(readSelectEvents(input(['right']), hitTest)).toEqual([{ type: 'switch', delta: 1 }]);
    expect(readSelectEvents(input(['up', 'down']), hitTest)).toEqual([]);
  });

  it('orders switching before confirm, so confirm commits to the character landed on', () => {
    expect(readSelectEvents(input(['confirm', 'right']), hitTest)).toEqual([
      { type: 'switch', delta: 1 },
      { type: 'confirm' },
    ]);
  });

  it('reads back', () => {
    expect(readSelectEvents(input(['back']), hitTest)).toEqual([{ type: 'back' }]);
  });

  it('switches when an arrow is clicked', () => {
    const left = centre(ARROW_LEFT_HIT);
    const right = centre(ARROW_RIGHT_HIT);
    const press = { over: true, down: true, pressed: true };
    expect(readSelectEvents(input([], { ...left, ...press }), hitTest)).toEqual([{ type: 'switch', delta: -1 }]);
    expect(readSelectEvents(input([], { ...right, ...press }), hitTest)).toEqual([{ type: 'switch', delta: 1 }]);
  });

  it('picks the hero on show for a mouse click on the card, as Enter does, and leaves a finger there alone', () => {
    const at = { ...centre(CARD), over: true };
    expect(readSelectEvents(input([], { ...at, down: true, pressed: true }), hitTest)).toEqual([{ type: 'confirm' }]);
    expect(readSelectEvents(input([], at), hitTest)).toEqual([]);
    expect(readSelectEvents(input([], { ...at, down: true, pressed: true, kind: 'touch' }), hitTest)).toEqual([]);
  });

  it('reads nothing from a pointer hovering, pressing or tapping the skills or the heading', () => {
    for (const area of [SKILL_ROWS[0], SKILL_ROWS[1], NAME_ROW]) {
      const at = { ...centre(area), over: true };
      expect(readSelectEvents(input([], at), hitTest)).toEqual([]);
      expect(readSelectEvents(input([], { ...at, down: true, pressed: true }), hitTest)).toEqual([]);
      expect(readSelectEvents(input([], { ...at, released: true }), hitTest)).toEqual([]);
    }
  });
});

describe('hitTest', () => {
  it('finds every interactive area and nothing in the gaps', () => {
    expect(hitTest(centre(ARROW_LEFT_HIT).x, centre(ARROW_LEFT_HIT).y)).toBe('arrowLeft');
    expect(hitTest(centre(ARROW_RIGHT_HIT).x, centre(ARROW_RIGHT_HIT).y)).toBe('arrowRight');
    expect(hitTest(319, 0)).toBeNull();
  });

  it('finds the card, and nothing on the heading or the skills', () => {
    expect(hitTest(centre(CARD).x, centre(CARD).y)).toBe('card');
    for (const area of [NAME_ROW, SKILL_ROWS[0], SKILL_ROWS[1]]) {
      expect(hitTest(centre(area).x, centre(area).y)).toBeNull();
    }
  });

  it("grows the skill rows with a look's bigger icons and keeps them clear of the CONFIRM and BACK keys", () => {
    const tall = selectLayout(32);
    const [first, second] = tall.skillRows;
    // The rows still hang from the SKILLS header and only grow downwards.
    expect(first).toMatchObject({ y: SKILL_ROWS[0].y, h: 32 });
    expect(second.y).toBe(first.y + 36);
    // The second slot, and its name centred on it, end above the keys' finger-sized areas.
    const keys = new KeyHints({ ...KEY_HINTS, style: { font: BitmapFont.fromGlyphData(smallFont), fill: '#ffffff' } });
    const reach = Math.min(keys.area('confirm').y, keys.area('back').y);
    expect(second.y + second.h).toBeLessThanOrEqual(reach);
    expect(second.y + (32 - SKILL_NAME_HEIGHT) / 2 + SKILL_NAME_HEIGHT).toBeLessThanOrEqual(reach);
    expect(tall.hitTest(centre(second).x, centre(second).y)).toBeNull();
  });

  it('keeps classic-sized rows where the select screen lays them out, under the SKILLS header', () => {
    expect(selectLayout(24).skillRows).toEqual([
      { x: 170, y: 138, w: 140, h: 24 },
      { x: 170, y: 166, w: 140, h: 24 },
    ]);
  });
});
