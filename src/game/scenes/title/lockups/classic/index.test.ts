import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseHex } from '@/engine/gfx/color';
import { Gfx } from '@/engine/gfx/Gfx';
import { RasterCanvas, type RasterContext, rasterContext } from '@/engine/gfx/testing';
import { LOCKUP_INK } from '../../../../art/logos';
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
 * The screen column where PRODUCT's P starts its bright face at the top:
 * its leftmost face pixel in its top three rows. The P is found in the top
 * word's shine image (its letter faces alone) as the face holding the
 * word's leftmost pixel, the P's foot, which the slant leaves furthest left.
 */
function faceStartOfP(): number {
  const [target] = art.glint.targets;
  if (!target) throw new Error('the lockup has no glint targets');
  const shine = target.shine as unknown as RasterCanvas;
  const { data } = shine.getContext();
  const isFace = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < shine.width && y < shine.height && (data[(y * shine.width + x) * 4 + 3] as number) > 0;
  let foot: [number, number] | null = null;
  for (let x = 0; x < shine.width && !foot; x++) {
    for (let y = 0; y < shine.height && !foot; y++) if (isFace(x, y)) foot = [x, y];
  }
  if (!foot) throw new Error('the top word has no face');
  // Flood the P's face from its foot.
  const letter: [number, number][] = [];
  const seen = new Set<number>();
  const queue: [number, number][] = [foot];
  for (let next = queue.pop(); next; next = queue.pop()) {
    const [x, y] = next;
    if (!isFace(x, y) || seen.has(y * shine.width + x)) continue;
    seen.add(y * shine.width + x);
    letter.push(next);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const top = Math.min(...letter.map(([, y]) => y));
  return target.left + Math.min(...letter.filter(([, y]) => y < top + 3).map(([x]) => x));
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

  it("starts the name's cream on the column where PRODUCT's P starts its bright face, at the top", () => {
    const ctx = render();
    // The name's letters are its cream; PORTFOLIO's, further right, never come first.
    let nameStart = Number.POSITIVE_INFINITY;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (inNameRow(ctx, px, py) && colourAt(ctx, px, py) === rgb(palette.cream)) nameStart = Math.min(nameStart, px);
      }
    }
    expect(nameStart).toBe(faceStartOfP());
  });

  it('sets the site flush with the header ink on the right, inside the header on the left', () => {
    const { row, header } = inkSpans(render());
    expect(row.right).toBe(header.right);
    expect(row.left).toBeGreaterThan(header.left);
  });

  it('keeps the name and the site apart, the middle of the row open', () => {
    const ctx = render();
    const { row } = inkSpans(ctx);
    let [gap, widest] = [0, 0];
    for (let px = row.left; px <= row.right; px++) {
      const inked = Array.from({ length: height }, (_, py) => inNameRow(ctx, px, py)).includes(true);
      gap = inked ? 0 : gap + 1;
      widest = Math.max(widest, gap);
    }
    expect(widest).toBeGreaterThan(width / 4);
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
