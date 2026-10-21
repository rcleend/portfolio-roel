import { describe, expect, it } from 'vitest';
import { bars, fill, repeat, rest } from './compose';

describe('lane helpers', () => {
  it('joins and repeats bars', () => {
    expect(bars('C4 . . .', 'E4 . . .')).toBe('C4 . . . | E4 . . .');
    expect(repeat('k s', 3)).toBe('k s | k s | k s');
    expect(rest(2)).toBe('- | -');
  });

  it('fills rhythm templates, keeping marks and literal tokens', () => {
    expect(fill('r . o r:5 | ~o - C4 r[37]', { r: 'F2', o: 'F3' })).toBe('F2 . F3 F2:5 | ~F3 - C4 F2[37]');
    expect(fill('x . y', { x: 'A4' })).toBe('A4 . y');
  });
});
