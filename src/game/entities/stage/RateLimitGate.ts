import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects, type Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import type { PropSheet } from '../../levels/art/LevelArt';
import type { GateStyle } from '../../world/stage';

/** The beam never reaches into the HUD. */
const BEAM_TOP = 26;
/** The last moments of a phase blink, so players can time their dash. */
const WARNING_SECONDS = 0.45;
const BEAM_WIDTH = 12;

/**
 * A "429 Too Many Requests" gate: it closes and opens on a fixed cycle. While
 * closed, a red beam blocks the whole column above it, so the only way
 * through is to wait for the green light. It never closes on top of someone.
 */
export class RateLimitGate {
  readonly #style: GateStyle;
  readonly #propWidth: number;
  readonly #propHeight: number;
  readonly #groundY: number;
  /** Left edge of the prop. */
  readonly x: number;
  #closed = true;
  #timer: number;

  constructor(style: GateStyle, centerX: number, groundY: number, propWidth: number, propHeight: number) {
    this.#style = style;
    this.#propWidth = propWidth;
    this.#propHeight = propHeight;
    this.#groundY = groundY;
    this.x = Math.round(centerX - propWidth / 2);
    // Stagger neighbouring gates so they do not pulse in lockstep.
    this.#timer = (centerX / 37) % style.closedSeconds;
  }

  get closed(): boolean {
    return this.#closed;
  }

  /** The blocking column while closed. */
  get wall(): Rect | null {
    return this.#closed ? this.#column() : null;
  }

  update(dt: number, occupants: readonly Rect[]): void {
    this.#timer += dt;
    const phase = this.#closed ? this.#style.closedSeconds : this.#style.openSeconds;
    if (this.#timer < phase) return;
    if (!this.#closed && occupants.some((rect) => intersects(rect, this.#column()))) return;
    this.#closed = !this.#closed;
    this.#timer = 0;
  }

  render(gfx: Gfx, prop: PropSheet, time: number): void {
    const top = this.#groundY - this.#propHeight;
    const phase = this.#closed ? this.#style.closedSeconds : this.#style.openSeconds;
    const warning = phase - this.#timer < WARNING_SECONDS && blink(time, 4 / 60, 4 / 60);
    prop.draw(gfx, this.x, top, this.#closed !== warning ? 0 : 1);
    if (!this.#closed || warning) return;
    const cx = this.x + Math.floor(this.#propWidth / 2);
    const glow = blink(time, 2 / 60, 2 / 60);
    gfx.fillRect(cx - 3, BEAM_TOP, 6, top - BEAM_TOP, glow ? '#5a1c24' : '#4a1838');
    gfx.fillRect(cx - 2, BEAM_TOP, 4, top - BEAM_TOP, '#9e3028');
    gfx.fillRect(cx - 1, BEAM_TOP, 2, top - BEAM_TOP, this.#style.beamColor);
    // Emitter cap at the top of the beam.
    gfx.fillRect(cx - 4, BEAM_TOP - 2, 8, 3, '#2c1c38');
    gfx.fillRect(cx - 3, BEAM_TOP - 1, 6, 1, '#6a6280');
    // Sparks crawl up the beam.
    const crawl = Math.floor(time * 90) % 24;
    for (let y = top - crawl; y > BEAM_TOP; y -= 24) gfx.fillRect(cx - 1, y, 2, 2, '#fff4b0');
  }

  #column(): Rect {
    const cx = this.x + this.#propWidth / 2;
    return { x: cx - BEAM_WIDTH / 2, y: 0, w: BEAM_WIDTH, h: this.#groundY };
  }
}
