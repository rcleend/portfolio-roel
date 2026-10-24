import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { profile } from '@/content';
import { parseHex } from '@/engine/gfx/color';
import { Gfx } from '@/engine/gfx/Gfx';
import { type TextStyle, textInk } from '@/engine/gfx/TextStyle';
import { RasterCanvas, type RasterContext, rasterContext } from '@/engine/gfx/testing';
import { condensedType, LOCKUP_INK } from '../../../../art/logos';
import { palette } from '../../../../palette';
import { TITLE_LAYOUT } from '../../layout';
import type { LockupArt } from '../TitleLockup';
import { classicLockup } from '.';

const { width, height } = TITLE_LAYOUT.screen;
/** The colours of the name row's lettering, which the logo lines never use. */
const ROW_COLOURS = [palette.cream, LOCKUP_INK].map(rgb);

/** The columns a set of pixels spans, inclusive; grown pixel by pixel as they are found. */
interface Span {
  left: number;
  right: number;
}

let art: LockupArt;

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new RasterCanvas() });
  art = classicLockup.prepare();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** The lockup `travel` pixels short of settling, on a blank screen. */
function render(travel = 0): RasterContext {
  const ctx = rasterContext(width, height);
  art.draw(new Gfx(ctx as unknown as CanvasRenderingContext2D, width, height), travel);
  return ctx;
}

/** `hex` as 0xrrggbb, the way `colourAt` reports colours. */
function rgb(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (r << 16) | (g << 8) | b;
}

/** The colour painted at (px, py) as 0xrrggbb, or `null` where nothing is. */
function colourAt(ctx: RasterContext, px: number, py: number): number | null {
  const i = (py * width + px) * 4;
  const { data } = ctx;
  return data[i + 3] ? ((data[i] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i + 2] as number) : null;
}

/**
 * Whether (px, py) belongs to the name row. Its cream and dark brown appear
 * in the header only in the trademark, which sits low, by the bottom word.
 */
function inNameRow(ctx: RasterContext, px: number, py: number): boolean {
  const colour = colourAt(ctx, px, py);
  return colour !== null && ROW_COLOURS.includes(colour) && py < art.bounds.y + art.bounds.h / 2;
}

/** The columns the name row inks and those the header (PRODUCT, ENGINEER and the trademark) inks. */
function inkSpans(ctx: RasterContext): { row: Span; header: Span } {
  const row: Span = { left: width, right: -1 };
  const header: Span = { left: width, right: -1 };
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (colourAt(ctx, px, py) === null) continue;
      const span = inNameRow(ctx, px, py) ? row : header;
      span.left = Math.min(span.left, px);
      span.right = Math.max(span.right, px);
    }
  }
  return { row, header };
}

/**
 * The widths of the row's runs of inked columns, left to right, and of the
 * blank runs between them: the row's words, as the eye separates them.
 */
function rowRuns(ctx: RasterContext): { words: number[]; spaces: number[] } {
  const inked = Array.from({ length: width }, (_, px) =>
    Array.from({ length: height }, (_, py) => inNameRow(ctx, px, py)).includes(true),
  );
  const runs: { inked: boolean; width: number }[] = [];
  for (const column of inked.slice(inked.indexOf(true), inked.lastIndexOf(true) + 1)) {
    const last = runs.at(-1);
    if (last?.inked === column) last.width++;
    else runs.push({ inked: column, width: 1 });
  }
  return {
    words: runs.filter((run) => run.inked).map((run) => run.width),
    spaces: runs.filter((run) => !run.inked).map((run) => run.width),
  };
}

describe('classic lockup', () => {
  it('settles with its ink centred on screen, to the pixel', () => {
    const ink = render().paintedBounds();
    if (!ink) throw new Error('the lockup inks nothing');
    const left = ink.x;
    const right = width - (ink.x + ink.w);
    // An odd ink width cannot split evenly: then the spare pixel goes to the right.
    expect(right - left).toBe(ink.w % 2);
  });

  it('sets the name and the site as one row, joined by a middle dot and spaced evenly', () => {
    const style: TextStyle = {
      font: condensedType(),
      fill: palette.cream,
      outline: LOCKUP_INK,
      shadow: { color: LOCKUP_INK, x: 1, y: 1 },
    };
    const words = `${profile.name} · ${profile.site}`.toUpperCase().split(' ');
    const { words: inked, spaces } = rowRuns(render());
    expect(inked).toEqual(words.map((word) => textInk(style, word, 0, 0)?.w));
    expect(new Set(spaces).size).toBe(1);
  });

  it('ends the row flush with the header ink on the right, inside the header on the left', () => {
    const { row, header } = inkSpans(render());
    expect(row.right).toBe(header.right);
    expect(row.left).toBeGreaterThan(header.left);
  });

  it('leaves paper between the row and PRODUCT in every column', () => {
    const ctx = render();
    for (let px = 0; px < width; px++) {
      let foot = -1;
      for (let py = 0; py < height; py++) if (inNameRow(ctx, px, py)) foot = py;
      if (foot >= 0) expect(colourAt(ctx, px, foot + 1), `column ${px}`).toBeNull();
    }
  });

  it('brings the name row in with the top word', () => {
    // Little enough that the row stays on screen.
    const travel = 6;
    const settled = inkSpans(render());
    const sliding = inkSpans(render(travel));
    expect(sliding.row).toEqual({ left: settled.row.left + travel, right: settled.row.right + travel });
  });

  it('keeps the inked lockup inside its bounds', () => {
    const ink = render().paintedBounds();
    const { x, y, w, h } = art.bounds;
    expect(ink && ink.x >= x && ink.y >= y && ink.x + ink.w <= x + w && ink.y + ink.h <= y + h).toBe(true);
  });
});
