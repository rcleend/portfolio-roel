import { describe, expect, it } from 'vitest';
import { controlDevice, keyCapFor, keyCapForCode } from './keyLabels';

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

  it("shows the touch pad's own controls on a touch screen", () => {
    expect(keyCapFor('left', 'touch')).toEqual({ pad: 'dpad' });
    expect(keyCapFor('right', 'touch')).toEqual({ pad: 'dpad' });
    expect(keyCapFor('jump', 'touch')).toEqual({ pad: 'red' });
    expect(keyCapFor('attack', 'touch')).toEqual({ pad: 'yellow' });
    expect(keyCapFor('skill1', 'touch')).toEqual({ pad: 'green' });
    expect(keyCapFor('skill2', 'touch')).toEqual({ pad: 'blue' });
    expect(keyCapFor('pause', 'touch')).toEqual({ pad: 'start' });
  });
});

describe('controlDevice', () => {
  it('starts on the pad on a touch screen and on the keyboard elsewhere', () => {
    expect(controlDevice(null, null, true)).toBe('touch');
    expect(controlDevice(null, null, false)).toBe('keyboard');
  });

  it('follows the last press, and a pointer leaves it as it is', () => {
    expect(controlDevice('touch', 'keyboard', true)).toBe('keyboard');
    expect(controlDevice('keyboard', 'touch', false)).toBe('touch');
    expect(controlDevice('gamepad', 'pointer', true)).toBe('gamepad');
  });
});
