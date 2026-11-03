import { describe, expect, it, vi } from 'vitest';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { IDLE_POINTER, InputSnapshot } from '@/engine/input/InputSnapshot';
import type { Action } from '../input/bindings';
import { Button } from './Button';
import { windowThemes } from './theme';

// The window's banded fill needs a canvas; only the hand is under test.
vi.mock('./Window', () => ({ drawWindow: () => {} }));

/** A Gfx that only notes what it is asked to draw. */
function recordingGfx(): { gfx: Gfx; sprites: unknown[] } {
  const sprites: unknown[] = [];
  const gfx = new Proxy({} as Gfx, {
    get: (_target, name) => {
      if (name === 'measureText') return () => ({ width: 20, height: 8 });
      if (name === 'sprite') return (sheet: unknown) => sprites.push(sheet);
      return () => {};
    },
  });
  return { gfx, sprites };
}

const hand = {} as SpriteSheet<'point'>;

function button(): Button {
  return new Button({
    label: 'PLAY AGAIN',
    bounds: { x: 40, y: 40, w: 80, h: 16 },
    theme: windowThemes.indigo,
    style: {} as TextStyle,
    cursor: hand,
  });
}

const input = (pointing: boolean): InputSnapshot<Action> =>
  new InputSnapshot<Action>(new Map(), IDLE_POINTER, null, pointing);

describe('Button', () => {
  it('shows the hand beside a focused button for the keys, and hides it while the visitor points', () => {
    const subject = button();
    subject.update(input(false), true, 1 / 60);
    const keys = recordingGfx();
    subject.render(keys.gfx);
    expect(keys.sprites).toEqual([hand]);

    subject.update(input(true), true, 1 / 60);
    const pointer = recordingGfx();
    subject.render(pointer.gfx);
    expect(pointer.sprites).toEqual([]);

    // A key again: the hand is back on the next frame.
    subject.update(input(false), true, 1 / 60);
    const back = recordingGfx();
    subject.render(back.gfx);
    expect(back.sprites).toEqual([hand]);
  });

  it('never shows the hand beside a button without focus', () => {
    const subject = button();
    subject.update(input(false), false, 1 / 60);
    const { gfx, sprites } = recordingGfx();
    subject.render(gfx);
    expect(sprites).toEqual([]);
  });

  it('marks the pointer over it clickable, and only over it', () => {
    const subject = button();
    const at = (x: number, y: number) => {
      const step = new InputSnapshot<Action>(new Map(), { ...IDLE_POINTER, x, y, over: true }, 'pointer', true);
      subject.update(step, false, 1 / 60);
      return step.overClickable;
    };
    expect(at(60, 48)).toBe(true);
    expect(at(10, 48)).toBe(false);
  });
});
