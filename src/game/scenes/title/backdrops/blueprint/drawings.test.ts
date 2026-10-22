import { describe, expect, it } from 'vitest';
import { intersects, rect } from '@/engine/math/Rect';
import { TITLE_LAYOUT } from '../../layout';
import { DRAWINGS } from './drawings';
import type { Point } from './pen';
import { HEAD_REACH } from './plotter';
import { FRAME, TITLE_BLOCK } from './sheet';

/** The screen's middle columns, where the prompt and the copyright are centred. */
const TEXT_COLUMN = rect(96, 0, 128, TITLE_LAYOUT.screen.height);

describe.each(DRAWINGS)('the $name drawing', (drawing) => {
  const pixels = drawing.strokes.flat();

  it('inks only inside its bounds', () => {
    const { x, y, w, h } = drawing.bounds;
    for (const [px, py] of pixels) {
      expect(px >= x && px < x + w && py >= y && py < y + h, `${px},${py}`).toBe(true);
    }
    expect(drawing.strokes.every((stroke) => stroke.length > 0)).toBe(true);
  });

  it('sits in a free corner: inside the frame, below any lockup, beside the text and off the title block', () => {
    const { x, y, w, h } = drawing.bounds;
    expect(x).toBeGreaterThan(FRAME.x);
    expect(x + w).toBeLessThan(FRAME.x + FRAME.w - 1);
    expect(y + h).toBeLessThan(FRAME.y + FRAME.h - 1);
    // Lockups settle above the prompt, so nothing from its row down, pen included, ends up behind the logo.
    expect(y - HEAD_REACH).toBeGreaterThanOrEqual(TITLE_LAYOUT.promptY);
    expect(intersects(drawing.bounds, TEXT_COLUMN)).toBe(false);
    expect(intersects(drawing.bounds, TITLE_BLOCK.box)).toBe(false);
  });
});

describe('the gear', () => {
  it('cuts its eight teeth evenly: a quarter turn leaves its outline unchanged', () => {
    const gear = DRAWINGS.find((drawing) => drawing.name === 'gear');
    const outline = gear?.strokes[0] ?? [];
    const [cx, cy] = [50, 199];
    const keys = new Set(outline.map(([x, y]: Point) => `${x - cx},${y - cy}`));
    const turned = new Set(outline.map(([x, y]: Point) => `${y - cy},${-(x - cx)}`));
    expect(keys.size).toBeGreaterThan(80);
    expect(turned).toEqual(keys);
  });
});
