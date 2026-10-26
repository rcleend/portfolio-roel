import { describe, expect, it } from 'vitest';
import { nextRovingIndex } from './roving';

describe('nextRovingIndex', () => {
  it('moves with the arrows and wraps at both ends', () => {
    expect(nextRovingIndex('ArrowRight', 0, 7)).toBe(1);
    expect(nextRovingIndex('ArrowRight', 6, 7)).toBe(0);
    expect(nextRovingIndex('ArrowLeft', 0, 7)).toBe(6);
    expect(nextRovingIndex('ArrowLeft', 3, 7)).toBe(2);
  });

  it('jumps to the first and last control', () => {
    expect(nextRovingIndex('Home', 4, 7)).toBe(0);
    expect(nextRovingIndex('End', 1, 7)).toBe(6);
  });

  it('leaves other keys alone, including the zoom field’s Up and Down', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab']) expect(nextRovingIndex(key, 2, 7)).toBeNull();
    expect(nextRovingIndex('ArrowRight', 0, 0)).toBeNull();
  });
});
