import type { Gfx } from '@/engine/gfx/Gfx';
import type { Vec2 } from '@/engine/math/Vec2';
import type { RenderKit } from '../RenderKit';
import { Shot, type ShotEnvironment, type ShotTarget, type ShotView } from './Shot';

const SPEED = 200;
/** Max turn per second, radians: tight enough to find its mark, loose enough to arc visibly. */
const TURN_RATE = 6.5;
const TRAIL = 6;

/** The north star as a look sees it: a shot with the positions it just passed through, newest first. */
export interface StarShotView extends ShotView {
  readonly trail: readonly Vec2[];
}

/**
 * NORTH STAR: a star that homes in on the most frustrated customer on screen,
 * ignoring everything else on the way (it flies through bubbles).
 */
export class HomingStar extends Shot {
  readonly #trail: { x: number; y: number }[] = [];

  constructor(x: number, y: number, direction: -1 | 1) {
    super(
      { w: 10, h: 10, damage: 4, life: 2.6, pierces: false, impact: 'star' },
      x,
      y,
      direction * SPEED * 0.6,
      -SPEED * 0.8,
    );
  }

  protected override steer(dt: number, env: ShotEnvironment): void {
    this.#trail.unshift({ x: this.x, y: this.y });
    if (this.#trail.length > TRAIL) this.#trail.pop();
    const target = mostFrustrated(env.targets);
    if (!target) return;
    const desired = Math.atan2(target.rect.y + target.rect.h / 2 - this.y, target.rect.x + target.rect.w / 2 - this.x);
    const current = Math.atan2(this.vy, this.vx);
    let turn = desired - current;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const heading = current + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn));
    this.vx = Math.cos(heading) * SPEED;
    this.vy = Math.sin(heading) * SPEED;
  }

  render(gfx: Gfx, kit: RenderKit): void {
    this.#trail.forEach((point, index) => {
      if (index % 2 === 1) return;
      gfx.pixel(point.x, point.y, index < 2 ? '#fff4b0' : '#ffd84a');
    });
    gfx.sprite(kit.fx.star, 'twinkle', this.age, this.x, this.y);
  }
}

/** The target with the most frustration left; ties go to the first. */
export function mostFrustrated<T extends ShotTarget>(targets: readonly T[]): T | null {
  let best: T | null = null;
  for (const target of targets) if (!best || target.frustration > best.frustration) best = target;
  return best;
}
