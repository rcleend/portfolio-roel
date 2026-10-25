import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Gfx } from '@/engine/gfx/Gfx';
import { RasterCanvas, rasterContext } from '@/engine/gfx/testing';
import { RAMP_RGBA } from '../../title/backdrops/blueprint/inks';
import { sheetSteps } from '../../title/backdrops/blueprint/sheet';
import { CARD_INNER } from '../layout';
import { drawField } from './field';

const [width, height] = [320, 240];

beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
afterAll(() => vi.unstubAllGlobals());

/** The ramp step of every pixel inside the card, row by row. */
function fieldSteps(): number[][] {
  const ctx = rasterContext(width, height);
  drawField(new Gfx(ctx as unknown as CanvasRenderingContext2D, width, height));
  const { x, y, w, h } = CARD_INNER;
  return Array.from({ length: h }, (_, row) =>
    Array.from({ length: w }, (_, column) => {
      const i = ((y + row) * width + x + column) * 4;
      return RAMP_RGBA.findIndex(({ r, g, b }) => ctx.data[i] === r && ctx.data[i + 1] === g && ctx.data[i + 2] === b);
    }),
  );
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('character card field', () => {
  let steps: number[][] = [];
  beforeAll(() => {
    steps = fieldSteps();
  });

  it("is printed in the blueprint ramp's three deepest steps", () => {
    expect(new Set(steps.flat())).toEqual(new Set([0, 1, 2]));
  });

  it('deepens towards the top, unexposed navy over Prussian', () => {
    const rows = steps.map(mean);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(2);
    // The dither varies from row to row, so compare whole thirds of the card.
    const size = Math.floor(rows.length / 3);
    const third = (i: number): number => mean(rows.slice(i * size, (i + 1) * size));
    expect(third(0)).toBeLessThan(third(1));
    expect(third(1)).toBeLessThan(third(2));
  });

  it('is darker than the paper it is set into, row by row', () => {
    const paper = sheetSteps(false);
    const { x, y, w } = CARD_INNER;
    steps.forEach((row, index) => {
      const under = Array.from({ length: w }, (_, column) => paper[(y + index) * width + x + column] as number);
      expect(mean(row), `row ${index}`).toBeLessThan(mean(under) - 1);
    });
  });
});
