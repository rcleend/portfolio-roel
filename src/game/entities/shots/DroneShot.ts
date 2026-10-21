import type { Gfx } from '@/engine/gfx/Gfx';
import { Shot } from './Shot';

const SPEED = 250;

/** AGENT SUMMON's drone fires these small cyan pulses at the nearest customer. */
export class DroneShot extends Shot {
  constructor(x: number, y: number, towardX: number, towardY: number) {
    const dx = towardX - x;
    const dy = towardY - y;
    const length = Math.hypot(dx, dy) || 1;
    super(
      { w: 5, h: 5, damage: 1, life: 0.8, pierces: false, impact: 'spark' },
      x,
      y,
      (dx / length) * SPEED,
      (dy / length) * SPEED,
    );
  }

  render(gfx: Gfx): void {
    const tx = -this.vx / SPEED;
    const ty = -this.vy / SPEED;
    gfx.pixel(this.x + tx * 4, this.y + ty * 4, '#1a6a8a');
    gfx.pixel(this.x + tx * 2, this.y + ty * 2, '#3fb8e8');
    gfx.fillRect(this.x - 1, this.y - 1, 3, 3, '#6fe8ff');
    gfx.pixel(this.x, this.y, '#ffffff');
  }
}
