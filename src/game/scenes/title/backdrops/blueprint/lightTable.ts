import type { Gfx } from '@/engine/gfx/Gfx';
import { bitmapToCanvas } from '../../../../art/logos/raster/toCanvas';
import type { TitleFrame } from '../TitleBackdrop';
import { lightGrid } from './gridWave';
import { INK, shadeOf } from './inks';
import { exposeSheet, FRAME, sheetSteps } from './sheet';
import { BOOT_FRAMES, framesSince, litRadius, scanProgress, WARM_UP, warmUpExposure } from './timeline';

/** How far below fully lit the sheet sits before the light table comes on: near-black navy, lines unseen. */
const UNLIT_EXPOSURE = -7;
/** The boot's leading edge: grid lines this far inside the newest compass ring glow. */
const BOOT_EDGE = 16;
/** The scan line: its leading row three steps brighter, then a trail stepping back down to the paper. */
const SCAN_TRAIL: readonly (readonly [rows: number, exposure: number])[] = [
  [1, 3],
  [2, 2],
  [6, 1],
];

/**
 * The light table under the sheet (docs/ART-DIRECTION.md › Title ›
 * Blueprint). It is off on the strike's frame and switches on behind the
 * compass rings, so the drawing boots outwards from the impact; under
 * reduced motion it warms up in even palette steps instead. Once the title
 * idles, its scan line passes down the sheet once a loop. Every lighting is
 * the whole sheet painted at another exposure, never an alpha wash.
 */
export class LightTable {
  readonly #unlit: HTMLCanvasElement;
  readonly #lit: HTMLCanvasElement;
  /** The warm-up's in-between steps and the scan line's glow, by exposure. */
  readonly #exposures: ReadonlyMap<number, HTMLCanvasElement>;

  constructor() {
    const lines = sheetSteps(true);
    const expose = (exposure: number) => bitmapToCanvas(() => exposeSheet(lines, exposure));
    this.#unlit = bitmapToCanvas(() => exposeSheet(sheetSteps(false), UNLIT_EXPOSURE));
    this.#lit = expose(0);
    const exposures = [...WARM_UP, ...SCAN_TRAIL.map(([, exposure]) => exposure)];
    this.#exposures = new Map(exposures.map((exposure) => [exposure, expose(exposure)] as const));
  }

  /** The sheet as lit `at` frames into the intro. */
  draw(gfx: Gfx, frame: TitleFrame, at: number): void {
    const { reducedMotion, impact } = frame;
    if (at >= BOOT_FRAMES) {
      gfx.image(this.#lit, 0, 0);
      const scan = scanProgress(framesSince(frame.time, frame.beats.settled), reducedMotion);
      if (scan !== null) this.#drawScan(gfx.ctx, scan);
    } else if (reducedMotion) {
      gfx.image(this.#exposures.get(warmUpExposure(at)) ?? this.#lit, 0, 0);
    } else {
      const radius = litRadius(at);
      gfx.image(this.#unlit, 0, 0);
      this.#drawLitDisc(gfx.ctx, impact.x, impact.y, radius);
      lightGrid(gfx.ctx, impact.x, impact.y, radius - BOOT_EDGE, radius, shadeOf(INK.mid), shadeOf(INK.pale));
    }
  }

  /** The lit sheet inside a disc around (cx, cy), copied row by row over the unlit one. */
  #drawLitDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const lit = this.#lit;
    if (radius <= 0) return;
    const top = Math.max(0, Math.ceil(cy - radius));
    const bottom = Math.min(lit.height - 1, Math.floor(cy + radius));
    for (let y = top; y <= bottom; y++) {
      const dy = y + 0.5 - cy;
      const half = Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
      const left = Math.max(0, cx - half);
      const right = Math.min(lit.width - 1, cx + half);
      if (right >= left) ctx.drawImage(lit, left, y, right - left + 1, 1, left, y, right - left + 1, 1);
    }
  }

  /**
   * The scan line `progress` (0 → 1) of the way down the frame, relighting
   * the sheet in steps as it passes. Its carriage rides the frame's side
   * rails as two small markers, so the pass reads even behind the logo.
   */
  #drawScan(ctx: CanvasRenderingContext2D, progress: number): void {
    const top = FRAME.y + 1;
    const row = top + Math.round(progress * (FRAME.h - 3));
    const left = FRAME.x + 1;
    const width = FRAME.w - 2;
    let below = row + 1;
    for (const [rows, exposure] of SCAN_TRAIL) {
      const sheet = this.#exposures.get(exposure);
      const from = Math.max(top, below - rows);
      if (sheet && below > from) ctx.drawImage(sheet, left, from, width, below - from, left, from, width, below - from);
      below = from;
    }
    const right = FRAME.x + FRAME.w - 1;
    ctx.fillStyle = shadeOf(INK.white);
    ctx.fillRect(FRAME.x - 2, row - 1, 1, 3);
    ctx.fillRect(FRAME.x - 1, row, 1, 1);
    ctx.fillRect(right + 2, row - 1, 1, 3);
    ctx.fillRect(right + 1, row, 1, 1);
  }
}
