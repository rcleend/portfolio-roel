import { describe, expect, it } from 'vitest';
import { validatePixelArt } from '@/engine/gfx/PixelArt';
import { codeBoltSheet, droneSheet, heartSheet, starSheet, stickyNoteSheet } from './index';

describe('fx sheets', () => {
  it.each([
    ['code bolt', codeBoltSheet],
    ['sticky note', stickyNoteSheet],
    ['star', starSheet],
    ['drone', droneSheet],
    ['heart', heartSheet],
  ] as const)('%s satisfies the pixel-art contract', (name, sheet) => {
    expect(() => validatePixelArt(sheet, name)).not.toThrow();
  });
});
