import { createCanvas, paintCanvas } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { easeOutCubic } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';

const POLE_HEIGHT = 144;
const CLOTH = { w: 100, h: 18 } as const;
const RAISE_SECONDS = 1.4;

/**
 * Berlin's goal: a tall flagpole whose banner reads PRODUCT-MARKET FIT. It
 * waits furled at the foot of the pole and runs up when the escalated
 * customer has been retained, waving column by column.
 */
export class GoalFlag {
  readonly x: number;
  readonly groundY: number;
  readonly #label: string;
  #raisedAt: number | null = null;
  #cloth: HTMLCanvasElement | null = null;

  constructor(x: number, groundY: number, label: string) {
    this.x = x;
    this.groundY = groundY;
    this.#label = label;
  }

  raise(time: number): void {
    this.#raisedAt ??= time;
  }

  render(gfx: Gfx, style: TextStyle, time: number): void {
    const top = this.groundY - POLE_HEIGHT;
    gfx.fillRect(this.x - 5, this.groundY - 4, 11, 4, '#1c1420');
    gfx.fillRect(this.x - 4, this.groundY - 5, 9, 1, '#5c5a76');
    gfx.fillRect(this.x - 1, top, 3, POLE_HEIGHT - 4, '#9a98b2');
    gfx.fillRect(this.x - 1, top, 1, POLE_HEIGHT - 4, '#e0e0ee');
    gfx.fillRect(this.x + 1, top, 1, POLE_HEIGHT - 4, '#5c5a76');
    gfx.circle(this.x, top - 3, 3, '#ffd23a');
    gfx.pixel(this.x - 1, top - 4, '#fff2a0');

    const raise = this.#raisedAt === null ? 0 : segment(time - this.#raisedAt, 0, RAISE_SECONDS, easeOutCubic);
    const lowY = this.groundY - 10 - CLOTH.h;
    const highY = top + 2;
    const y = Math.round(lowY + (highY - lowY) * raise);
    if (raise === 0) {
      // Furled: a rolled bundle at the foot of the pole.
      gfx.fillRect(this.x - 4, lowY + 4, 4, CLOTH.h - 4, '#c89a2a');
      gfx.fillRect(this.x - 3, lowY + 4, 1, CLOTH.h - 4, '#ffd23a');
      return;
    }
    const cloth = this.#clothCanvas(style);
    // The banner flies to the left of the pole; each column bobs on a travelling wave.
    for (let column = 0; column < CLOTH.w; column++) {
      const distance = CLOTH.w - column;
      const wave = Math.round(Math.sin(time * 7 - distance * 0.18) * Math.min(2, distance / 16));
      gfx.image(cloth, this.x - 1 - distance, y + wave, { source: { x: column, y: 0, w: 1, h: CLOTH.h } });
    }
  }

  #clothCanvas(style: TextStyle): HTMLCanvasElement {
    if (this.#cloth) return this.#cloth;
    const canvas = createCanvas(CLOTH.w, CLOTH.h);
    paintCanvas(canvas, (ctx) => {
      const gfx = new Gfx(ctx);
      gfx.fillRect(0, 0, CLOTH.w, CLOTH.h, '#1a0a14');
      gfx.fillRect(1, 1, CLOTH.w - 2, CLOTH.h - 2, { stops: ['#fff2a0', '#ffd23a', '#e8a020'], bands: 3 });
      gfx.fillRect(1, CLOTH.h - 3, CLOTH.w - 2, 1, '#e43440');
      gfx.fillRect(1, 2, CLOTH.w - 2, 1, '#e43440');
      gfx.text(
        this.#label,
        CLOTH.w / 2,
        6,
        { ...style, fill: '#2a1408', outline: undefined, shadow: undefined },
        {
          align: 'center',
        },
      );
    });
    this.#cloth = canvas;
    return canvas;
  }
}
