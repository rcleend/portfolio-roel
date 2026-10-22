import { describe, expect, it } from 'vitest';
import { parseHex, type Rgba } from '@/engine/gfx/color';
import { TITLE_LAYOUT } from '../../layout';
import { INK, RAMP_RGBA } from './inks';
import { LETTER_HEIGHT } from './lettering';
import { exposeSheet, FRAME, insideFrame, sheetSteps, TITLE_BLOCK } from './sheet';

const { width, height } = TITLE_LAYOUT.screen;
const { impact } = TITLE_LAYOUT;

/** Relative luminance, as WCAG defines it. */
function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Mean luminance of the bare paper over a box. */
function paperLuminance(x0: number, y0: number, x1: number, y1: number): number {
  const paper = sheetSteps(false);
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) total += luminance(RAMP_RGBA[paper[y * width + x] as number] as Rgba);
  }
  return total / ((x1 - x0) * (y1 - y0));
}

describe('blueprint sheet', () => {
  const lined = sheetSteps(true);
  const paper = sheetSteps(false);

  it('is identical every time it is painted', () => {
    expect(sheetSteps(true)).toEqual(lined);
    expect(exposeSheet(lined, -2).data).toEqual(exposeSheet(sheetSteps(true), -2).data);
  });

  it('lifts the paper behind the logo, so its near-black outline and dark-red extrusion stay readable', () => {
    // Where every lockup's two lines settle, around the impact point, and the logo paint's darkest edges.
    const behindLogo = paperLuminance(impact.x - 140, impact.y - 62, impact.x + 140, impact.y + 36);
    const outline = luminance(parseHex('#1c0703'));
    const extrusion = luminance(parseHex('#300a03'));
    const face = luminance(parseHex('#ffaa2a'));
    expect(contrast(behindLogo, outline)).toBeGreaterThan(2.8);
    expect(contrast(behindLogo, extrusion)).toBeGreaterThan(2.6);
    expect(contrast(behindLogo, face)).toBeGreaterThan(3);
  });

  it('runs darker towards the top corners, Prussian navy round a lit middle', () => {
    const corner = paperLuminance(0, 0, 40, 30);
    expect(corner).toBeLessThan(paperLuminance(impact.x - 40, impact.y - 20, impact.x + 40, impact.y + 20) / 2);
    expect(corner).toBeLessThan(paperLuminance(0, height - 30, 40, height));
  });

  it('prints the grid a step or two above the paper it crosses', () => {
    const { box } = TITLE_BLOCK;
    for (let y = FRAME.y + 1; y < FRAME.y + FRAME.h - 1; y++) {
      for (let x = FRAME.x + 1; x < FRAME.x + FRAME.w - 1; x++) {
        if (x >= box.x && y >= box.y) continue;
        const lift = (lined[y * width + x] as number) - (paper[y * width + x] as number);
        const onGrid = x % 8 === 0 || y % 8 === 0;
        expect(onGrid ? [1, 2] : [0], `${x},${y}`).toContain(lift);
      }
    }
  });

  it('only frames the drawing with lines: the margin and frame stay plain paper without them', () => {
    expect(insideFrame(FRAME.x, FRAME.y + 20)).toBe(false);
    expect(lined[(FRAME.y + 20) * width + FRAME.x]).toBe(INK.mid);
    expect(paper[(FRAME.y + 20) * width + FRAME.x]).toBeLessThan(INK.ghost);
  });

  it('leaves the revision cell blank for the letter the backdrop climbs through', () => {
    const { x, y } = TITLE_BLOCK.revision;
    for (let row = y; row < y + LETTER_HEIGHT; row++) {
      for (let col = x; col < x + 3; col++) expect(lined[row * width + col]).toBeLessThan(INK.ghost);
    }
  });

  it('relights every pixel by whole ramp steps', () => {
    const dim = exposeSheet(lined, -1);
    for (const i of [0, 1234, 40_000, width * height - 1]) {
      const step = Math.max(0, (lined[i] as number) - 1);
      const { r, g, b } = RAMP_RGBA[step] as Rgba;
      expect([...dim.data.slice(i * 4, i * 4 + 3)]).toEqual([r, g, b]);
    }
  });
});
