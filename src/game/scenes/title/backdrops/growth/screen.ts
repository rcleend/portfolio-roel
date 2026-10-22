import type { BitmapFont } from '@/engine/gfx/BitmapFont';
import { context2d } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { bitmapToCanvas } from '../../../../art/logos/raster/toCanvas';
import { CHART, READOUT, SCALE, TICKER } from './layout';
import { AXIS, CYAN, INK, LABEL, TAPE } from './palette';
import { type RasterEdge, STRIP } from './timeline';
import { paintFrame, paintGlass, tickRow } from './tube';

/**
 * The tube itself, drawn live: the glass at whatever brightness the
 * choreography asks for, the chart frame lighting up strip by strip, the
 * ceiling (torn once the line has broken it), the counting scale and the
 * ticker's live dot.
 */
export interface Screen {
  /** The bare glass at each brightness, keyed by levels off rest. */
  readonly glass: ReadonlyMap<number, HTMLCanvasElement>;
  /** The grid, axes and rules, with the lettering that never changes. */
  readonly frame: HTMLCanvasElement;
  readonly font: BitmapFont;
}

/** Where the raster has got to while the tube powers up. */
export interface Raster {
  readonly impactY: number;
  /** Rows lit either side of the impact row; `Infinity` once the whole screen is. */
  readonly reach: number;
  /** The rows the beam reached this very frame, or `null`. */
  readonly edge: RasterEdge | null;
  /** The brightness, in levels off rest, the beam's leading edge burns at. */
  readonly hot: number;
}

/** The tear in the ceiling: pixels either side of the breach knocked out, and how far its torn ends bend up. */
const TEAR = { half: 3, bend: 1 } as const;

/** Paints the glass at each of `boosts` and the frame with its lettering; `levels` is the glass level of every pixel. */
export function paintScreen(
  levels: Uint8Array,
  boosts: readonly number[],
  font: BitmapFont,
  width: number,
  height: number,
): Screen {
  const glass = new Map(boosts.map((boost) => [boost, bitmapToCanvas(paintGlass(levels, width, height, boost))]));
  const frame = bitmapToCanvas(paintFrame(width, height));
  const gfx = new Gfx(context2d(frame), width, height);
  const label: TextStyle = { font, fill: LABEL };
  gfx.text('LEENDERS CORP · Q4 1996', READOUT.x, READOUT.y, label);
  gfx.text('0%', CHART.left - 4, tickRow(0) - 3, label, { align: 'right' });
  gfx.text('LIVE', 11, TICKER.textY, { font, fill: TAPE.figure });
  gfx.fillRect(TICKER.tagWidth - 3, TICKER.top + 1, 1, height - TICKER.top - 1, AXIS);
  return { glass, frame, font };
}

/**
 * Draws the glass `boost` levels off rest. While the raster is still
 * opening only the rows it has reached are lit; the ones it reached this
 * frame glow hot, with a bright line where it stands.
 */
export function drawGlass(gfx: Gfx, screen: Screen, boost: number, raster: Raster): void {
  const rest = screen.glass.get(boost) as HTMLCanvasElement;
  if (!Number.isFinite(raster.reach)) {
    gfx.image(rest, 0, 0);
    return;
  }
  const { impactY, reach, edge } = raster;
  drawRows(gfx, rest, impactY - reach, impactY + reach + 1);
  if (!edge) return;
  const hot = screen.glass.get(raster.hot) as HTMLCanvasElement;
  drawRows(gfx, hot, impactY - edge.to, impactY - edge.from);
  drawRows(gfx, hot, impactY + edge.from + 1, impactY + edge.to + 1);
  gfx.fillRect(0, impactY - edge.to, gfx.width, 1, CYAN[4]);
  gfx.fillRect(0, impactY + edge.to, gfx.width, 1, CYAN[4]);
}

/** Copies rows [top, bottom) of a full-screen canvas, clipped to the screen. */
function drawRows(gfx: Gfx, canvas: HTMLCanvasElement, top: number, bottom: number): void {
  const from = Math.max(0, top);
  const to = Math.min(gfx.height, bottom);
  if (to > from) gfx.ctx.drawImage(canvas, 0, from, gfx.width, to - from, 0, from, gfx.width, to - from);
}

/** Draws the strips of the frame that `lit` says are on; neighbouring ones go out as one blit, so a settled frame is a single draw. */
export function drawFrame(gfx: Gfx, screen: Screen, lit: (strip: number) => boolean): void {
  const strips = stripCount(gfx.height);
  let runStart: number | null = null;
  for (let strip = 0; strip <= strips; strip++) {
    const top = strip === 0 ? 0 : STRIP.top + strip * STRIP.height;
    const on = strip < strips && lit(strip);
    if (on && runStart === null) runStart = top;
    if (!on && runStart !== null) {
      drawRows(gfx, screen.frame, runStart, top);
      runStart = null;
    }
  }
}

/** How many grid strips cover a screen `height` rows tall. */
export function stripCount(height: number): number {
  return Math.ceil((height - STRIP.top) / STRIP.height);
}

/** The ceiling the line breaks: whole, or torn open around `breachX` with its ends bent up by the blow. */
export function drawCeiling(gfx: Gfx, breachX: number | null): void {
  const right = gfx.width;
  if (breachX === null) {
    gfx.fillRect(CHART.left, CHART.top, right - CHART.left, 1, AXIS);
    return;
  }
  const leftEnd = breachX - TEAR.half - 1;
  const rightEnd = breachX + TEAR.half + 1;
  gfx.fillRect(CHART.left, CHART.top, leftEnd - CHART.left, 1, AXIS);
  gfx.fillRect(rightEnd + 1, CHART.top, right - rightEnd - 1, 1, AXIS);
  gfx.pixel(leftEnd, CHART.top - TEAR.bend, AXIS);
  gfx.pixel(rightEnd, CHART.top - TEAR.bend, AXIS);
}

/** The top tick's label, `value` percent: it counts up while the line draws. */
export function drawScaleLabel(gfx: Gfx, screen: Screen, value: number): void {
  const y = tickRow(SCALE.steps) - 3;
  gfx.text(`${value}%`, CHART.left - 4, y, { font: screen.font, fill: LABEL }, { align: 'right' });
}

/** The live tag's dot. */
export function drawLiveDot(gfx: Gfx, screen: Screen): void {
  gfx.text('●', 3, TICKER.textY, { font: screen.font, fill: INK[3] });
}
