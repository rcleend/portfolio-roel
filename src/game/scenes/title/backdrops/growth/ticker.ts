import { type Experience, experience } from '@/content';
import type { BitmapFont } from '@/engine/gfx/BitmapFont';
import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import { TICKER } from './layout';
import { TAPE } from './palette';

/** One entry on the tape: what moved, by how much if the CV says, and which way. */
export interface Quote {
  readonly label: string;
  readonly figure?: string;
  readonly trend: 'up' | 'down';
}

/**
 * The career highlights whose metrics the tape quotes. Labels and figures
 * come straight from the content, so the tape never claims more than the
 * CV does.
 */
const QUOTED_HIGHLIGHTS: readonly string[] = ['scripe-teams', 'scripe-onboarding', 'luna-agent'];

/** Moves the tape reports without a figure: shipping, churn and the game's one enemy. */
const MOODS: readonly Quote[] = [
  { label: 'SHIPPED', trend: 'up' },
  { label: 'CHURN', trend: 'down' },
  { label: 'UNHAPPY CUSTOMERS', trend: 'down' },
];

/** The tape's quotes in order, a metric then a mood, so figures never crowd each other. */
export function tapeQuotes(entries: readonly Experience[] = experience): Quote[] {
  const metrics = QUOTED_HIGHLIGHTS.map((id): Quote => {
    const metric = entries.flatMap((entry) => entry.highlights).find((highlight) => highlight.id === id)?.metric;
    if (!metric) throw new Error(`Growth ticker: highlight "${id}" has no metric to quote`);
    const figure = metric.from === undefined ? metric.to : `${metric.from}→${metric.to}`;
    return { label: metric.label.toUpperCase(), figure, trend: 'up' };
  });
  return metrics.flatMap((quote, index) => {
    const mood = MOODS[index];
    return mood ? [quote, mood] : [quote];
  });
}

const ARROW = { up: '▲', down: '▼' } as const;
/** Up is green; down is cyan, the cool colour, because everything the tape sees go down was meant to. */
const ARROW_INK = { up: TAPE.up, down: TAPE.down } as const;

/** The pieces of one quote, left to right, each in its own ink. */
function quoteRuns(quote: Quote): readonly (readonly [text: string, ink: string])[] {
  const runs: [string, string][] = [[`${quote.label} `, TAPE.label]];
  if (quote.figure !== undefined) runs.push([`${quote.figure} `, TAPE.figure]);
  runs.push([ARROW[quote.trend], ARROW_INK[quote.trend]]);
  return runs;
}

/** How wide a quote prints. */
export function quoteWidth(font: BitmapFont, quote: Quote): number {
  return quoteRuns(quote).reduce((sum, [text]) => sum + font.measure(text), 0);
}

/** Quotes never sit closer together than this. */
const MIN_GAP = 12;

/**
 * Where each quote starts along a tape `length` pixels long: the spare room
 * shared out evenly after each one, the last gap closing the loop back to
 * the first, so the tape can wrap without a seam.
 */
export function tapeLayout(widths: readonly number[], length: number): number[] {
  const spare = length - widths.reduce((sum, width) => sum + width, 0);
  if (spare < widths.length * MIN_GAP) {
    throw new Error(
      `Growth ticker: the quotes need ${length - spare + widths.length * MIN_GAP} px of tape, not ${length}`,
    );
  }
  let x = 0;
  return widths.map((width, index) => {
    const start = x;
    x += width + Math.floor((spare * (index + 1)) / widths.length) - Math.floor((spare * index) / widths.length);
    return start;
  });
}

/** Paints the tape, exactly `length` pixels long, so scrolling one length takes one idle loop. */
export function paintTape(font: BitmapFont, quotes: readonly Quote[], length: number): HTMLCanvasElement {
  const starts = tapeLayout(
    quotes.map((quote) => quoteWidth(font, quote)),
    length,
  );
  const canvas = createCanvas(length, font.cellHeight);
  const gfx = new Gfx(context2d(canvas), length, font.cellHeight);
  quotes.forEach((quote, index) => {
    let x = starts[index] ?? 0;
    for (const [text, ink] of quoteRuns(quote)) {
      gfx.text(text, x, 0, { font, fill: ink });
      x += font.measure(text);
    }
  });
  return canvas;
}

/**
 * Draws the tape `scroll` pixels along, running from the live tag to the
 * screen's right edge and wrapping seamlessly where its end meets its
 * start.
 */
export function drawTape(gfx: Gfx, tape: HTMLCanvasElement, scroll: number): void {
  const window = gfx.width - TICKER.tagWidth;
  const start = ((scroll % tape.width) + tape.width) % tape.width;
  const first = Math.min(window, tape.width - start);
  // Straight to the context: Gfx.image would allocate a source rectangle every frame.
  gfx.ctx.drawImage(tape, start, 0, first, tape.height, TICKER.tagWidth, TICKER.textY, first, tape.height);
  if (first < window) {
    const rest = window - first;
    gfx.ctx.drawImage(tape, 0, 0, rest, tape.height, TICKER.tagWidth + first, TICKER.textY, rest, tape.height);
  }
}
