import type { Gfx } from '@/engine/gfx/Gfx';
import type { ShotEnvironment } from './Shot';
import { Shot } from './Shot';

const GRAVITY = 720;

/** The paint colours ARTSY cycles through, with an outline shade for each. */
export const PAINTS = [
  { fill: '#ff4fa3', rim: '#7a0f45' },
  { fill: '#3fd8ff', rim: '#0b4a6a' },
  { fill: '#ffd84a', rim: '#7a4a08' },
] as const;

export type Paint = (typeof PAINTS)[number];

/** ARTSY's primary attack: a lobbed blob of paint on a short arc. Hits a little harder to make up for the range. */
export class PaintSplat extends Shot {
  readonly paint: Paint;

  constructor(x: number, y: number, direction: -1 | 1, paint: Paint) {
    super({ w: 7, h: 7, damage: 1.5, life: 1.2, pierces: false, impact: 'paint' }, x, y, direction * 175, -150);
    this.paint = paint;
  }

  protected override steer(dt: number, _env: ShotEnvironment): void {
    this.vy += GRAVITY * dt;
  }

  render(gfx: Gfx): void {
    gfx.circle(this.x, this.y, 3, this.paint.rim);
    gfx.circle(this.x, this.y, 2, this.paint.fill);
    gfx.pixel(this.x - 1, this.y - 1, '#ffffff');
    // A drip trailing behind sells the arc.
    gfx.pixel(this.x - this.direction * 4, this.y - 2, this.paint.fill);
  }
}
