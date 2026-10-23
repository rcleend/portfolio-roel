import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Gfx } from '@/engine/gfx/Gfx';
import { RasterCanvas, rasterContext } from '@/engine/gfx/testing';
import { RAMP_RGBA } from '../title/backdrops/blueprint/inks';
import { sheetSteps } from '../title/backdrops/blueprint/sheet';
import { drawBackdrop } from './backdrop';

/** The native screen, which the blueprint paper covers. */
const [width, height] = [320, 240];

beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
afterAll(() => vi.unstubAllGlobals());

describe('mission select backdrop', () => {
  it("is the title's blueprint paper with a survey grid a ramp step above it every 16 px", () => {
    const ctx = rasterContext(width, height);
    drawBackdrop(new Gfx(ctx as unknown as CanvasRenderingContext2D, width, height));
    const paper = sheetSteps(false);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const step = RAMP_RGBA.findIndex(
          ({ r, g, b }) => ctx.data[i] === r && ctx.data[i + 1] === g && ctx.data[i + 2] === b,
        );
        const line = x % 16 === 8 || y % 16 === 8;
        expect(step, `${x},${y}`).toBe((paper[y * width + x] as number) + (line ? 1 : 0));
      }
    }
  });
});
