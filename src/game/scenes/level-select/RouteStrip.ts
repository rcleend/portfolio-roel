import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { bob } from '@/engine/motion/oscillators';
import { palette } from '../../palette';
import { planeSheet } from './art/icons';
import { ROUTE_Y } from './layout';
import { routePose, stopToX } from './route';

export interface RouteStop {
  readonly x: number;
  readonly reached: boolean;
  /** The stop that has not been written yet: the visitor's team. */
  readonly open: boolean;
}

const DASH = 3;
const GAP = 2;

/**
 * The flight path under the postcards: SF → Berlin → "?" in career order,
 * flown by a small plane. Legs already flown are drawn in gold; the leg to
 * the visitor's team is a dimmer, still-to-be-written dotted line.
 */
export class RouteStrip {
  readonly #plane = SpriteSheet.compile(planeSheet, 'mission-select/plane');
  readonly #label: TextStyle;

  constructor(label: TextStyle) {
    this.#label = label;
  }

  render(gfx: Gfx, stops: readonly RouteStop[], time: number): void {
    const xs = stops.map((stop) => stop.x);
    stops.slice(1).forEach((stop, i) => {
      const from = stops[i];
      if (!from) return;
      const future = i === stops.length - 2;
      dashed(gfx, from.x, stop.x, ROUTE_Y, future ? palette.violet : palette.gold, future ? 1 : 0);
    });
    for (const stop of stops) {
      if (stop.open) {
        gfx.text('?', stop.x - 2, ROUTE_Y - 4, this.#label);
        continue;
      }
      gfx.fillRect(stop.x - 2, ROUTE_Y - 2, 5, 5, palette.ink);
      gfx.fillRect(stop.x - 1, ROUTE_Y - 1, 3, 3, stop.reached ? palette.gold : palette.lavender);
    }

    const pose = routePose(time);
    const x = stopToX(pose.position, xs);
    const y = ROUTE_Y - 5 - (pose.flying ? bob(time, 1, 0.5) : 0);
    if (pose.flying) {
      // A short contrail: three puffs spaced behind the tail, thinning out.
      gfx.pixel(x - 9, y + 1, palette.lilac);
      gfx.pixel(x - 12, y + 1, palette.lavender);
      gfx.pixel(x - 15, y + 1, palette.violet);
    }
    gfx.sprite(this.#plane, 'fly', time, x, y);
  }
}

function dashed(gfx: Gfx, x0: number, x1: number, y: number, color: string, gapExtra: number): void {
  for (let x = x0 + 4; x < x1 - 3; x += DASH + GAP + gapExtra) {
    gfx.fillRect(x, y, Math.min(DASH, x1 - 3 - x), 1, color);
  }
}
