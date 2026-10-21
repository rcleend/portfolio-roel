import { flash, wipe } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { lerp } from '@/engine/math/scalar';
import { easeOutExpo } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { frames, segment } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import type { GameScene, GameStep } from '../params';
import { drawStubBanner } from '../StubBanner';

/**
 * STUB — replaced by the boot/title crew with the Metal Slug-style title
 * (fireball, crater, sliding logo; docs/ART-DIRECTION.md › Title).
 */
export class TitleScene implements GameScene {
  readonly #services: GameServices;
  #time = 0;
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(): void {
    this.#services.audio.playMusic('title');
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    if (!this.#leaving && this.#time > 0.6 && step.input.anyPressed) {
      this.#leaving = true;
      this.#services.audio.playSfx('coin');
      const transition = this.#services.settings.reducedMotion ? wipe() : flash();
      this.#services.director.goTo('characterSelect', undefined, transition);
    }
  }

  render(gfx: Gfx): void {
    const { text } = this.#services;
    gfx.fillRect(0, 0, gfx.width, gfx.height, {
      stops: [palette.khakiDark, palette.khakiLight],
      bands: 6,
      dither: 'bayer4',
    });
    const slide = segment(this.#time, 0.1, 0.45, easeOutExpo);
    gfx.text(
      'ROEL LEENDERS',
      228,
      62,
      { ...text.label, fill: palette.cream, outline: '#2a1a0a', shadow: undefined },
      { align: 'right' },
    );
    gfx.text('PRODUCT', lerp(360, 160, slide), 76, text.title, { align: 'center' });
    gfx.text('ENGINEER', lerp(-40, 160, slide), 94, text.title, { align: 'center' });
    if (this.#time > 0.6 && blink(this.#time, frames(32), frames(16))) {
      gfx.text('PRESS ANY BUTTON', gfx.width / 2, 160, text.prompt, { align: 'center' });
    }
    gfx.text('© 1996 LEENDERS CORP.', gfx.width / 2, 214, { ...text.label, fill: palette.white }, { align: 'center' });
    drawStubBanner(gfx, this.#services, 'TITLE');
  }
}
