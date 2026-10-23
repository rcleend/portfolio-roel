import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseHex, type Rgba } from '@/engine/gfx/color';
import { Gfx } from '@/engine/gfx/Gfx';
import { RasterCanvas, rasterContext } from '@/engine/gfx/testing';
import { MENU_FIELD } from '../../../character-select/backdrop';
import { TITLE_LAYOUT } from '../../layout';
import { GRID_FLOOR, INK, RAMP_RGBA } from './inks';
import { exposeSheet, FRAME, insideFrame, lightLevel, sheetSteps } from './sheet';

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

  it('lights the paper behind the logo, so its near-black outline and dark-red extrusion stay crisp', () => {
    // Where every lockup's two lines settle, around the impact point, and the logo paint's darkest edges.
    const behindLogo = paperLuminance(impact.x - 140, impact.y - 62, impact.x + 140, impact.y + 36);
    const outline = luminance(parseHex('#1c0703'));
    const extrusion = luminance(parseHex('#300a03'));
    const face = luminance(parseHex('#ffaa2a'));
    // The bare menu navy would leave the outline and the extrusion's far edge at barely 1:1.
    expect(contrast(paperLuminance(0, height - 30, 40, height), outline)).toBeLessThan(1.1);
    expect(contrast(behindLogo, outline)).toBeGreaterThan(1.65);
    expect(contrast(behindLogo, extrusion)).toBeGreaterThan(1.5);
    expect(contrast(behindLogo, face)).toBeGreaterThan(4.5);
  });

  describe('beyond the glow', () => {
    beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
    afterAll(() => vi.unstubAllGlobals());

    it("is character select's field, pixel for pixel, and never darker than it inside", () => {
      const ctx = rasterContext(width, height);
      new Gfx(ctx as unknown as CanvasRenderingContext2D, width, height).fillRect(0, 0, width, height, MENU_FIELD);
      const sheet = exposeSheet(paper, 0);
      const stepOf = (data: Uint8ClampedArray, i: number): number =>
        RAMP_RGBA.findIndex(({ r, g, b }) => data[i] === r && data[i + 1] === g && data[i + 2] === b);
      let unlit = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const field = stepOf(ctx.data, i);
          expect(field, `${x},${y}`).toBeGreaterThan(0);
          if (lightLevel(x, y) > 0) expect(stepOf(sheet.data, i), `${x},${y}`).toBeGreaterThanOrEqual(field);
          else {
            expect(stepOf(sheet.data, i), `${x},${y}`).toBe(field);
            unlit++;
          }
        }
      }
      // The bottom of the screen and the corners, around the prompt, the copyright and the drawings.
      expect(unlit / (width * height)).toBeGreaterThan(0.25);
    });
  });

  it("prints the grid in the menus' line navies on the field, and a step or two above the glow", () => {
    for (let y = FRAME.y + 1; y < FRAME.y + FRAME.h - 1; y++) {
      for (let x = FRAME.x + 1; x < FRAME.x + FRAME.w - 1; x++) {
        const under = paper[y * width + x] as number;
        const step = lined[y * width + x] as number;
        const onGrid = x % 8 === 0 || y % 8 === 0;
        if (!onGrid) expect(step, `${x},${y}`).toBe(under);
        else if (under < GRID_FLOOR.minor) expect([GRID_FLOOR.minor, GRID_FLOOR.major], `${x},${y}`).toContain(step);
        else expect([under + 1, under + 2], `${x},${y}`).toContain(step);
      }
    }
  });

  it('only frames the drawing with lines: the margin and frame stay plain paper without them', () => {
    expect(insideFrame(FRAME.x, FRAME.y + 20)).toBe(false);
    expect(lined[(FRAME.y + 20) * width + FRAME.x]).toBe(INK.mid);
    expect(paper[(FRAME.y + 20) * width + FRAME.x]).toBeLessThan(INK.ghost);
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
