import { describe, expect, it } from 'vitest';
import { isSkipKey, type KeyPress } from './keys';

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

describe('isSkipKey', () => {
  it('skips on any ordinary key, shifted or not', () => {
    for (const key of ['Enter', ' ', 'a', 'ArrowDown', 'PageDown']) expect(isSkipKey(press(key))).toBe(true);
    expect(isSkipKey(press('A'))).toBe(true);
  });

  it('lets Tab, Escape and lone modifiers through', () => {
    for (const key of ['Tab', 'Shift', 'Escape', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']) {
      expect(isSkipKey(press(key))).toBe(false);
    }
  });

  it('leaves browser and system shortcuts alone', () => {
    expect(isSkipKey(press('r', { ctrlKey: true }))).toBe(false);
    expect(isSkipKey(press('r', { metaKey: true }))).toBe(false);
    expect(isSkipKey(press('ArrowLeft', { altKey: true }))).toBe(false);
    for (const key of ['F1', 'F5', 'F11', 'F12']) expect(isSkipKey(press(key))).toBe(false);
  });
});
