import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutExpo } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { segment } from '@/engine/motion/progress';
import type { LevelTextStyles } from '../../ui/hud/styles';
import { overheadLift } from '../customer/renderCustomer';
import type { RenderKit } from '../RenderKit';
import type { Effect } from './Effect';

export interface FloatingTextOptions {
  /** Pixels risen over the first half of the lifetime. */
  readonly rise?: number;
  readonly life?: number;
  /** Pops above a customer of this scale, so it rises with a taller customer look (see `overheadLift`). */
  readonly aboveCustomer?: number;
}

/** Text that pops up and drifts, e.g. "+€99" above a happy customer or "POP!" where a bubble burst. */
export class FloatingText implements Effect {
  readonly #text: string;
  readonly #x: number;
  readonly #y: number;
  readonly #style: keyof LevelTextStyles;
  readonly #rise: number;
  readonly #life: number;
  readonly #aboveCustomer: number | null;
  #age = 0;

  constructor(text: string, x: number, y: number, style: keyof LevelTextStyles, options: FloatingTextOptions = {}) {
    this.#text = text;
    this.#x = x;
    this.#y = y;
    this.#style = style;
    this.#rise = options.rise ?? 14;
    this.#life = options.life ?? 0.9;
    this.#aboveCustomer = options.aboveCustomer ?? null;
  }

  get done(): boolean {
    return this.#age >= this.#life;
  }

  update(dt: number): void {
    this.#age += dt;
  }

  render(gfx: Gfx, kit: RenderKit): void {
    if (this.done) return;
    if (this.#age > this.#life * 0.7 && !blink(this.#age, 1 / 20, 1 / 20)) return;
    const lift = this.#aboveCustomer === null ? 0 : overheadLift(kit, this.#aboveCustomer);
    const y = this.#y - lift - this.#rise * segment(this.#age, 0, this.#life * 0.5, easeOutExpo);
    gfx.text(this.#text, this.#x, y, kit.levelText[this.#style], { align: 'center' });
  }
}
