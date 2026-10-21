import { describe, expect, it } from 'vitest';
import { keyCapFor, keyCapForCode } from './keyLabels';

describe('key labels', () => {
  it('names physical keys the way players know them', () => {
    expect(keyCapForCode('KeyZ')).toEqual({ text: 'Z' });
    expect(keyCapForCode('Space')).toEqual({ text: 'SPACE' });
    expect(keyCapForCode('ArrowLeft')).toEqual({ arrow: 'left' });
    expect(keyCapForCode('Escape')).toEqual({ text: 'ESC' });
  });

  it('shows the primary keyboard binding of each action', () => {
    expect(keyCapFor('left', 'keyboard')).toEqual({ arrow: 'left' });
    expect(keyCapFor('jump', 'keyboard')).toEqual({ text: 'Z' });
    expect(keyCapFor('attack', 'keyboard')).toEqual({ text: 'X' });
    expect(keyCapFor('skill1', 'keyboard')).toEqual({ text: 'C' });
    expect(keyCapFor('skill2', 'keyboard')).toEqual({ text: 'V' });
    expect(keyCapFor('pause', 'keyboard')).toEqual({ text: 'ESC' });
  });

  it('shows pad buttons when playing with a gamepad', () => {
    expect(keyCapFor('jump', 'gamepad')).toEqual({ text: 'A' });
    expect(keyCapFor('skill1', 'gamepad')).toEqual({ text: 'Y' });
    expect(keyCapFor('pause', 'gamepad')).toEqual({ text: 'START' });
  });
});
