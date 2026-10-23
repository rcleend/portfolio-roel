import { fade } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import type { GameScene, GameStep, TitleParams } from '../params';
import type { BackdropArt, TitleFrame } from './backdrops';
import { drawGlint } from './glint';
import { TITLE_LAYOUT } from './layout';
import type { LockupArt } from './lockups';
import {
  attractDue,
  CONFIRM_SECONDS,
  crossed,
  flashCoverage,
  glintProgress,
  isSettled,
  lockShake,
  logoVisible,
  promptLit,
  SLIDE_DISTANCE,
  slideRemaining,
  TITLE_TIMES,
} from './titleTimeline';
import { resolveTitleVariants } from './variants';

/** The lockup and backdrop chosen on entry, painted, and the part of every backdrop frame that never changes. */
interface Look {
  readonly lockup: LockupArt;
  readonly backdrop: BackdropArt;
  readonly setting: Omit<TitleFrame, 'time'>;
}

/**
 * "PRODUCT ENGINEER" — the Metal Slug-style title (docs/ART-DIRECTION.md ›
 * Title): an opening hit, the lockup slamming in, a white flash and the
 * settled logo. The look is a lockup on a backdrop picked by the scene's
 * params (docs/ARCHITECTURE.md › Title variants); the timing is this
 * scene's. Any button inserts a coin and moves on to the character select;
 * left alone, the intro replays as an attract loop.
 */
export class TitleScene implements GameScene<TitleParams | undefined> {
  readonly #services: GameServices;
  readonly #copyright: TextStyle;
  #look: Look | null = null;
  #time = 0;
  /** Scene time at which the current intro run started; moves forward for the attract loop. */
  #introStart = 0;
  #confirmedAt: number | null = null;
  #left = false;

  constructor(services: GameServices) {
    this.#services = services;
    this.#copyright = {
      font: services.fonts.label,
      fill: ['#ffffff', '#c4b8f5'],
      bands: 2,
      outline: palette.navy,
      shadow: { color: palette.navy, x: 1, y: 1 },
    };
  }

  enter(params: TitleParams | undefined): void {
    const variants = resolveTitleVariants(params);
    const lockup = variants.lockup.prepare();
    this.#look = {
      lockup,
      backdrop: variants.backdrop.prepare(),
      setting: {
        beats: TITLE_TIMES,
        reducedMotion: this.#services.settings.reducedMotion,
        screen: TITLE_LAYOUT.screen,
        impact: TITLE_LAYOUT.impact,
        lockupBounds: lockup.bounds,
      },
    };
    this.#services.audio.playMusic('title');
    this.#services.audio.playSfx('explosion');
  }

  exit(): void {}

  update(step: GameStep): void {
    const previous = this.#introTime;
    this.#time += step.dt;
    const intro = this.#introTime;
    if (this.#confirmedAt !== null) {
      if (!this.#left && this.#time - this.#confirmedAt >= CONFIRM_SECONDS) {
        this.#left = true;
        this.#services.director.goTo('characterSelect', undefined, fade({ duration: 0.5 }));
      }
      return;
    }
    if (step.input.anyPressed) {
      this.#confirm();
      return;
    }
    if (crossed(previous, intro, TITLE_TIMES.flashStart)) this.#services.audio.playSfx('flash');
    if (attractDue(intro)) {
      this.#introStart = this.#time;
      this.#services.audio.playSfx('explosion');
    }
  }

  render(gfx: Gfx): void {
    const look = this.#look;
    if (!look) return;
    const { lockup, backdrop } = look;
    const frame: TitleFrame = { ...look.setting, time: this.#introTime };
    const { time, reducedMotion } = frame;
    const shake = lockShake(time, reducedMotion);
    // A shaken frame leaves a sliver of black at the edge, as on the real hardware.
    gfx.clear(palette.black);
    gfx.withOffset(shake.x, shake.y, () => {
      backdrop.drawBehind(gfx, frame);
      if (logoVisible(time)) lockup.draw(gfx, slideRemaining(time) * SLIDE_DISTANCE);
      const glint = glintProgress(time);
      if (glint !== null) drawGlint(gfx, lockup.glint.targets, glint, lockup.glint.pivotY);
      backdrop.drawInFront?.(gfx, frame);
    });
    if (isSettled(time)) this.#renderSettledText(gfx, time);
    const flash = flashCoverage(time, reducedMotion);
    if (flash > 0) gfx.withAlpha(flash, () => gfx.fillRect(0, 0, gfx.width, gfx.height, palette.white));
  }

  get #introTime(): number {
    return this.#time - this.#introStart;
  }

  /** A press during the intro jumps straight to the settled title, so the coin always lands on the logo. */
  #confirm(): void {
    if (!isSettled(this.#introTime)) this.#introStart = this.#time - TITLE_TIMES.settled;
    this.#confirmedAt = this.#time;
    this.#services.audio.playSfx('coin');
  }

  #renderSettledText(gfx: Gfx, time: number): void {
    const confirmedFor = this.#confirmedAt === null ? null : this.#time - this.#confirmedAt;
    const center = gfx.width / 2;
    if (promptLit(time, confirmedFor)) {
      gfx.text('PRESS ANY BUTTON', center, TITLE_LAYOUT.promptY, this.#services.text.prompt, { align: 'center' });
    }
    gfx.text('© 1996 LEENDERS CORP.', center, TITLE_LAYOUT.copyrightY, this.#copyright, { align: 'center' });
  }
}
