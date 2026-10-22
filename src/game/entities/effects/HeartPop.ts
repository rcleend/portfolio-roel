import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutBack } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { segment } from '@/engine/motion/progress';
import { overheadLift } from '../customer/renderCustomer';
import type { RenderKit } from '../RenderKit';
import type { Effect } from './Effect';

const LIFE = 1.1;

/** A heart that springs up out of a customer who has just been won over. */
export class HeartPop implements Effect {
  readonly #x: number;
  readonly #y: number;
  readonly #scale: number;
  #age = 0;

  /** (x, y) is the top of the customer's hitbox; `scale` is the customer's, so the heart clears a taller look. */
  constructor(x: number, y: number, scale: number) {
    this.#x = x;
    this.#y = y;
    this.#scale = scale;
  }

  get done(): boolean {
    return this.#age >= LIFE;
  }

  update(dt: number): void {
    this.#age += dt;
  }

  render(gfx: Gfx, kit: RenderKit): void {
    if (this.done) return;
    if (this.#age > LIFE * 0.75 && !blink(this.#age, 1 / 20, 1 / 20)) return;
    const y = this.#y - overheadLift(kit, this.#scale) - 18 * segment(this.#age, 0, 0.35, easeOutBack);
    const sheet = kit.fx.heart;
    gfx.sprite(sheet, 'full', 0, this.#x - Math.floor(sheet.width / 2), y - sheet.height);
  }
}
