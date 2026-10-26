import { describe, expect, it } from 'vitest';
import { lastInputWasKeyboard, watchInputModality } from './inputModality';

describe('input modality', () => {
  it('follows the last key or pointer', () => {
    const target = new EventTarget();
    watchInputModality(target);
    expect(lastInputWasKeyboard()).toBe(false);
    target.dispatchEvent(new Event('keydown'));
    expect(lastInputWasKeyboard()).toBe(true);
    target.dispatchEvent(new Event('pointerdown'));
    expect(lastInputWasKeyboard()).toBe(false);
  });
});
