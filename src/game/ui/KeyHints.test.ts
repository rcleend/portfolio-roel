import { describe, expect, it } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { type ActionState, IDLE_POINTER, InputSnapshot, type PointerSnapshot } from '@/engine/input/InputSnapshot';
import type { Rect } from '@/engine/math/Rect';
import { smallFont } from '../art/fonts/small';
import type { Action } from '../input/bindings';
import { KeyHints } from './KeyHints';

const style = { font: BitmapFont.fromGlyphData(smallFont), fill: '#ffffff' };
const ANCHOR = { right: 300, y: 200 } as const;
const HELD: ActionState = { down: true, pressed: false, released: false };

function input(pointer: Partial<PointerSnapshot> = {}, held: readonly Action[] = []): InputSnapshot<Action> {
  return new InputSnapshot<Action>(
    new Map(held.map((action) => [action, HELD])),
    { ...IDLE_POINTER, ...pointer },
    null,
  );
}

const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2), over: true });

describe('KeyHints', () => {
  it('lays out CONFIRM then BACK, ending on the anchor', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    const confirm = keys.area('confirm');
    const back = keys.area('back');
    expect(confirm.x + confirm.w).toBe(back.x);
    expect(keys.hitTest(ANCHOR.right - 1, ANCHOR.y + 3)).toBe('back');
    expect(keys.hitTest(ANCHOR.right + 20, ANCHOR.y + 3)).toBeNull();
    expect(keys.hitTest(confirm.x - 1, ANCHOR.y + 3)).toBeNull();
  });

  it('gives each key an area well beyond its 7 px glyph, for fingertips', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    for (const key of ['confirm', 'back'] as const) {
      const area = keys.area(key);
      expect(area.h).toBeGreaterThanOrEqual(24);
      expect(area.w).toBeGreaterThanOrEqual(24);
      expect(keys.hitTest(area.x + 1, ANCHOR.y - 10)).toBe(key);
      expect(keys.hitTest(area.x + 1, ANCHOR.y + 16)).toBe(key);
    }
  });

  it('clicks on release over the key it pressed', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    const back = centre(keys.area('back'));
    expect(keys.update(input(back))).toBeNull();
    expect(keys.update(input({ ...back, down: true, pressed: true }))).toBeNull();
    expect(keys.update(input({ ...back, down: true }))).toBeNull();
    expect(keys.update(input({ ...back, released: true }))).toBe('back');
    expect(keys.update(input(back))).toBeNull();
  });

  it('clicks on a tap that starts and ends within one step', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    const confirm = centre(keys.area('confirm'));
    expect(keys.update(input({ ...confirm, pressed: true, released: true }))).toBe('confirm');
  });

  it('cancels when the pointer slides off before letting go', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    const confirm = centre(keys.area('confirm'));
    const back = centre(keys.area('back'));
    keys.update(input({ ...confirm, down: true, pressed: true }));
    expect(keys.update(input({ ...back, released: true }))).toBeNull();
    keys.update(input({ ...confirm, down: true, pressed: true }));
    expect(keys.update(input({ ...confirm, over: false, released: true }))).toBeNull();
  });

  it('ignores a release on a key that was pressed somewhere else', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    const back = centre(keys.area('back'));
    keys.update(input({ x: 10, y: 10, over: true, down: true, pressed: true }));
    keys.update(input({ ...back, down: true }));
    expect(keys.update(input({ ...back, released: true }))).toBeNull();
  });

  it('lights the key under the pointer and sinks it while held down', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    const confirm = centre(keys.area('confirm'));
    keys.update(input(confirm));
    expect([keys.state('confirm'), keys.state('back')]).toEqual(['hover', 'normal']);
    keys.update(input({ ...confirm, down: true, pressed: true }));
    expect(keys.state('confirm')).toBe('pressed');
    keys.update(input({ ...centre(keys.area('back')), down: true }));
    expect([keys.state('confirm'), keys.state('back')]).toEqual(['normal', 'hover']);
  });

  it('sinks the picture of a key while the real key is held', () => {
    const keys = new KeyHints({ ...ANCHOR, style });
    keys.update(input({}, ['back']));
    expect([keys.state('confirm'), keys.state('back')]).toEqual(['normal', 'pressed']);
  });
});
