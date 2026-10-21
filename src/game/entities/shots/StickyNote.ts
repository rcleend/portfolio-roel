import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../RenderKit';
import { Shot } from './Shot';

const SPEED = 215;

/** STRATEGY's primary attack: a sticky note that spins and flutters as it flies. */
export class StickyNote extends Shot {
  constructor(x: number, y: number, direction: -1 | 1) {
    super({ w: 8, h: 8, damage: 1, life: 0.85, pierces: false, impact: 'note' }, x, y, direction * SPEED, 0);
  }

  render(gfx: Gfx, kit: RenderKit): void {
    const flutter = Math.round(Math.sin(this.age * 22) * 2);
    gfx.sprite(kit.fx.stickyNote, 'spin', this.age, this.x, this.y + flutter, { flipX: this.direction < 0 });
  }
}
