import { describe, expect, it } from 'vitest';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { drawPrompt } from './prompt';

/** A Gfx that records its text and counts its rectangles; every character is 4 px wide. */
function recordingGfx(): { gfx: Gfx; texts: string[]; rects: () => number } {
  const texts: string[] = [];
  let rects = 0;
  const gfx = {
    text: (value: string) => texts.push(value),
    fillRect: () => {
      rects++;
    },
    measureText: (value: string) => ({ width: value.length * 4 }),
  } as unknown as Gfx;
  return { gfx, texts, rects: () => rects };
}

const style = { font: { ascent: 5, cellHeight: 7 }, fill: '#fff' } as unknown as TextStyle;

describe('drawPrompt', () => {
  it('names the key in words for a keyboard or a gamepad', () => {
    const { gfx, texts } = recordingGfx();
    drawPrompt(gfx, 0, 0, style, { action: 'confirm', label: 'CLOSE', device: 'keyboard' });
    drawPrompt(gfx, 0, 0, style, { action: 'pause', label: 'RESUME', device: 'keyboard' });
    drawPrompt(gfx, 0, 0, style, { action: 'pause', label: 'RESUME', device: 'gamepad' });
    expect(texts).toEqual(['CONFIRM: CLOSE', 'ESC: RESUME', 'START: RESUME']);
  });

  it("draws the touch pad's button instead of the word on a touch screen", () => {
    const { gfx, texts, rects } = recordingGfx();
    drawPrompt(gfx, 100, 0, style, { action: 'back', label: 'BACK', device: 'touch' }, 'right');
    expect(texts).toEqual(['BACK']);
    expect(rects()).toBeGreaterThan(10);
  });
});
