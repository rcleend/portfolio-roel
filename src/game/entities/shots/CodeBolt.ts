import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../RenderKit';
import { Shot } from './Shot';

const SPEED = 270;

/** HACKERMAN's primary attack: a fast, straight "</>" with a short glowing trail. */
export class CodeBolt extends Shot {
  constructor(x: number, y: number, direction: -1 | 1) {
    super({ w: 12, h: 6, damage: 1, life: 0.75, pierces: false, impact: 'spark' }, x, y, direction * SPEED, 0);
  }

  render(gfx: Gfx, kit: RenderKit): void {
    const trail = -this.direction;
    for (let i = 1; i <= 3; i++) {
      gfx.pixel(this.x + trail * (6 + i * 3), this.y + (i % 2), i === 1 ? '#7dff9a' : '#2a8a4a');
    }
    gfx.sprite(kit.fx.codeBolt, 'fly', this.age, this.x, this.y, { flipX: this.direction < 0 });
  }
}
