import { describe, expect, it } from 'vitest';
import { isSkipKey } from './keys';

describe('isSkipKey', () => {
  it('skips on any ordinary key', () => {
    for (const key of ['Enter', ' ', 'a', 'ArrowDown', 'PageDown', 'F5']) expect(isSkipKey(key)).toBe(true);
  });

  it('lets Tab, Escape and lone modifiers through', () => {
    for (const key of ['Tab', 'Shift', 'Escape', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']) {
      expect(isSkipKey(key)).toBe(false);
    }
  });
});
