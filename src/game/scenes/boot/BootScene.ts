import { fade } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { steps } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import type { GameServices } from '../../services';
import type { GameScene, GameStep } from '../params';
import { drawStubBanner } from '../StubBanner';

const AUTO_ADVANCE_SECONDS = 2;

/**
 * STUB — replaced by the boot/title crew with the full "REO·LEO" Neo Geo
 * boot (docs/ART-DIRECTION.md › Boot). Keeps the flow navigable meanwhile.
 */
export class BootScene implements GameScene {
  readonly #services: GameServices;
  #time = 0;
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(): void {
    this.#services.audio.playSfx('power-on');
  }

  exit(): void {
    this.#services.session.update((state) => ({ ...state, bootSeen: true }));
  }

  update(step: GameStep): void {
    this.#time += step.dt;
    if (this.#leaving) return;
    if (this.#time >= AUTO_ADVANCE_SECONDS || step.input.anyPressed) {
      this.#leaving = true;
      this.#services.director.goTo('title', undefined, fade({ duration: 0.5 }));
    }
  }

  render(gfx: Gfx): void {
    const { text } = this.#services;
    // White to black in flat steps, the way the real boot screen fades.
    const fadeOut = segment(this.#time, 0.3, 1.2, steps(6));
    const grey = Math.round(255 * (1 - fadeOut));
    gfx.clear(`rgb(${grey}, ${grey}, ${grey})`);
    const logo = { font: text.prompt.font, fill: fadeOut < 0.5 ? '#000000' : '#ffffff' };
    gfx.text('REO·LEO', gfx.width / 2, 100, logo, { align: 'center' });
    gfx.text('A LEENDERS PRODUCTION', gfx.width / 2, 124, { ...text.label, fill: '#1f6fff' }, { align: 'center' });
    drawStubBanner(gfx, this.#services, 'BOOT');
  }
}
