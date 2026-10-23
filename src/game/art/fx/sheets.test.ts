import { describe, expect, it } from 'vitest';
import { validatePixelArt } from '@/engine/gfx/PixelArt';
import { heartSheet, starSheet } from './index';

describe('shared fx sheets', () => {
  it.each([
    ['star', starSheet],
    ['heart', heartSheet],
  ] as const)('%s satisfies the pixel-art contract', (name, sheet) => {
    expect(() => validatePixelArt(sheet, name)).not.toThrow();
  });
});
