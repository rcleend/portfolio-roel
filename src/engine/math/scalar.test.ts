import { describe, expect, it } from 'vitest';
import { approach, clamp, inverseLerp, lerp, mod } from './scalar';

describe('scalar helpers', () => {
  it('clamps into range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('lerps and inverts', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(inverseLerp(10, 20, 12.5)).toBe(0.25);
    expect(inverseLerp(3, 3, 3)).toBe(0);
  });

  it('approaches without overshooting', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
  });

  it('wraps negatives with mod', () => {
    expect(mod(-1, 4)).toBe(3);
    expect(mod(5, 4)).toBe(1);
  });
});
