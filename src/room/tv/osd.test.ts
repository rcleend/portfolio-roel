// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { layoutOsdText, paintPauseOsd } from './osd';

describe('layoutOsdText', () => {
  it('measures text in whole scaled pixels with one-pixel spacing', () => {
    const { width, height } = layoutOsdText('PAUSE', 3);
    expect(width).toBe((5 * 6 - 1) * 3);
    expect(height).toBe(21);
  });

  it('places glyph pixels on the scaled grid', () => {
    const { rects } = layoutOsdText('E', 2);
    // Top bar of an E: five lit pixels on row 0.
    expect(rects.filter((r) => r.y === 0)).toHaveLength(5);
    expect(rects.every((r) => r.x % 2 === 0 && r.y % 2 === 0 && r.w === 2 && r.h === 2)).toBe(true);
  });

  it('rejects characters the OSD font cannot draw', () => {
    expect(() => layoutOsdText('PLAY', 1)).toThrow(/no glyph/);
  });
});

describe('paintPauseOsd', () => {
  // What the TV paints again when a GPU reset gives its canvas back blank.
  it('draws the indicator on the canvas it is given, shadow first', () => {
    const fills: string[] = [];
    const context = {
      set fillStyle(color: string) {
        fills.push(color);
      },
      fillRect: vi.fn(),
    };
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    expect(paintPauseOsd(canvas)).toBe(true);
    expect(fills).toEqual(['#001a06', '#46ff6a']);
    const { rects } = layoutOsdText('| PAUSE', 3);
    expect(context.fillRect).toHaveBeenCalledTimes(rects.length * 2);
  });
});
