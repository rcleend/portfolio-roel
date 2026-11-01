import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import { approach } from '@/engine/math/scalar';
import type { PropSheet } from '../../levels/art/LevelArt';
import type { Surface } from '../../world/collision';
import type { MoverStyle } from '../../world/stage';

/** Seconds a rider may be airborne before the vehicle decides it has been left. */
const RIDER_GRACE = 1.5;

/**
 * A vehicle on rails whose roof the player can ride: the cable car in San
 * Francisco, the U-Bahn carriage in Berlin. It waits at its home end, sets
 * off once someone climbs aboard, and heads back home whenever nobody is
 * riding — so a player who falls off always finds it waiting again.
 */
export class MovingPlatform implements Surface {
  readonly #style: MoverStyle;
  readonly #width: number;
  readonly #height: number;
  readonly #home: number;
  readonly #away: number;
  readonly #groundY: number;
  /** Left edge of the prop image. */
  #x: number;
  #dx = 0;
  #dwell = 0;
  #heading: 'home' | 'away' = 'home';
  #sinceRidden = Number.POSITIVE_INFINITY;

  /** `fromX`..`toX` is the whole track the vehicle covers; it starts at the left end. */
  constructor(style: MoverStyle, propWidth: number, propHeight: number, fromX: number, toX: number, groundY: number) {
    this.#style = style;
    this.#width = propWidth;
    this.#height = propHeight;
    this.#home = fromX;
    this.#away = Math.max(fromX, toX - propWidth);
    this.#groundY = groundY;
    this.#x = fromX;
  }

  get rect(): Rect {
    const { roofMargin, roofInset } = this.#style;
    return { x: this.#x + roofMargin, y: this.top + roofInset, w: this.#width - roofMargin * 2, h: 4 };
  }

  get dx(): number {
    return this.#dx;
  }

  get dy(): number {
    return 0;
  }

  /** Top edge of the prop image; the vehicle's wheels rest on the ground line. */
  get top(): number {
    return this.#groundY - this.#height;
  }

  get x(): number {
    return this.#x;
  }

  /** The span of track to draw rails along. */
  get track(): { readonly from: number; readonly to: number } {
    return { from: this.#home, to: this.#away + this.#width };
  }

  update(dt: number, ridden: boolean): void {
    this.#sinceRidden = ridden ? 0 : this.#sinceRidden + dt;
    // Hopping on the roof (say, to head-butt a block) must not send the vehicle home mid-jump.
    const heading = this.#sinceRidden < RIDER_GRACE ? 'away' : 'home';
    // A change of plan restarts the dwell, so boarding a waiting vehicle gives a beat before it sets off.
    if (heading !== this.#heading) {
      this.#heading = heading;
      this.#dwell = 0;
    }
    const target = heading === 'away' ? this.#away : this.#home;
    const before = this.#x;
    if (this.#x === target) {
      this.#dwell += dt;
    } else if (this.#dwell >= this.#style.dwell || this.#isMoving()) {
      this.#x = approach(this.#x, target, this.#style.speed * dt);
      if (this.#x === target) this.#dwell = 0;
    } else {
      this.#dwell += dt;
    }
    this.#dx = this.#x - before;
  }

  render(gfx: Gfx, prop: PropSheet): void {
    prop.draw(gfx, this.#x, this.top);
  }

  #isMoving(): boolean {
    return this.#x !== this.#home && this.#x !== this.#away;
  }
}
