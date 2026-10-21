import { profile } from '@/content';
import { fade } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { condensedType, LOCKUP_INK, type TitleLogoLine, titleLogo } from '../../art/logos';
import { SLANT } from '../../art/logos/product-engineer/lettering';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import type { GameScene, GameStep } from '../params';
import { CRATER_CENTER, drawFireball, titleArt } from './art';
import { drawGlint, type GlintTarget } from './art/glint';
import {
  attractDue,
  CONFIRM_SECONDS,
  craterVisible,
  crossed,
  fireballGlow,
  fireballRadius,
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

/** Where things settle, in screen pixels. Line positions are the top-left of each word's first letter. */
const LAYOUT = {
  impact: { x: 160, y: 100 },
  topLine: { x: 26, y: 40 },
  bottomLine: { x: 14, y: 88 },
  /** The name sits on the top word's shoulder, ending a little inside its right edge. */
  nameInset: 4,
  nameGap: 3,
  promptY: 166,
  copyrightY: 216,
} as const;

/** Crater wobble frames, played forwards and back so the loop never jumps. */
const WOBBLE = [0, 1, 2, 3, 2, 1] as const;
const WOBBLE_FPS = 10;
/** Strongest fireball light washing over the backdrop. */
const FIREBALL_GLOW_MAX = 0.3;

/**
 * "PRODUCT ENGINEER" — the Metal Slug-style title (docs/ART-DIRECTION.md ›
 * Title): fireball, crater, the two words slamming in from either side, a
 * white flash and the settled logo. Any button inserts a coin and moves on
 * to the character select; left alone, the intro replays as an attract loop.
 */
export class TitleScene implements GameScene {
  readonly #services: GameServices;
  readonly #art = titleArt();
  readonly #logo = titleLogo();
  readonly #name = profile.name.toUpperCase();
  readonly #styles: { readonly name: TextStyle; readonly copyright: TextStyle };
  #time = 0;
  /** Scene time at which the current intro run started; moves forward for the attract loop. */
  #introStart = 0;
  #confirmedAt: number | null = null;
  #left = false;

  constructor(services: GameServices) {
    this.#services = services;
    const label = services.fonts.label;
    this.#styles = {
      name: {
        font: condensedType(),
        fill: palette.cream,
        outline: LOCKUP_INK,
        shadow: { color: LOCKUP_INK, x: 1, y: 1 },
      },
      copyright: {
        font: label,
        fill: ['#ffffff', '#c4b8f5'],
        bands: 2,
        outline: palette.navy,
        shadow: { color: palette.navy, x: 1, y: 1 },
      },
    };
  }

  enter(): void {
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
    const time = this.#introTime;
    const reducedMotion = this.#services.settings.reducedMotion;
    const shake = lockShake(time, reducedMotion);
    // A shaken frame leaves a sliver of black at the edge, as on the real hardware.
    gfx.clear(palette.black);
    gfx.withOffset(shake.x, shake.y, () => {
      gfx.image(this.#art.backdrop, 0, 0);
      this.#renderImpact(gfx, time);
      if (logoVisible(time)) this.#renderLogo(gfx, slideRemaining(time) * SLIDE_DISTANCE);
    });
    const glint = glintProgress(time);
    if (glint !== null) {
      const { top, bottom } = this.#logo;
      const targets = [placeShine(top, LAYOUT.topLine), placeShine(bottom, LAYOUT.bottomLine)];
      drawGlint(gfx, targets, glint, LAYOUT.bottomLine.y + bottom.height);
    }
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

  #renderImpact(gfx: Gfx, time: number): void {
    const { impact } = LAYOUT;
    const radius = fireballRadius(time);
    if (radius > 0) {
      // The fireball lights up the whole card, dimming in steps as it collapses.
      gfx.withAlpha(fireballGlow(time) * FIREBALL_GLOW_MAX, () => gfx.fillRect(0, 0, gfx.width, gfx.height, '#fff6dc'));
      drawFireball(gfx, impact.x, impact.y, radius);
    }
    if (!craterVisible(time)) return;
    const frames = this.#art.craterFrames;
    const frame = frames[WOBBLE[Math.floor(time * WOBBLE_FPS) % WOBBLE.length] ?? 0];
    if (frame) gfx.image(frame, impact.x - CRATER_CENTER.x, impact.y - CRATER_CENTER.y);
  }

  /** `travel` pixels still to go: the top word comes in from the right, the bottom word from the left. */
  #renderLogo(gfx: Gfx, travel: number): void {
    const { top, bottom } = this.#logo;
    const topX = LAYOUT.topLine.x + travel;
    const bottomX = LAYOUT.bottomLine.x - travel;
    drawLine(gfx, top, topX, LAYOUT.topLine.y);
    // The name rides on the top word, the trademark on the bottom one.
    const nameRight = topX + top.width + top.height * SLANT - LAYOUT.nameInset;
    const nameTop = LAYOUT.topLine.y - this.#styles.name.font.cellHeight - LAYOUT.nameGap;
    gfx.text(this.#name, nameRight, nameTop, this.#styles.name, { align: 'right' });
    drawLine(gfx, bottom, bottomX, LAYOUT.bottomLine.y);
    const trademark = this.#logo.trademark;
    gfx.image(trademark, bottomX + bottom.width + 7, LAYOUT.bottomLine.y + bottom.height - trademark.height + 1);
  }

  #renderSettledText(gfx: Gfx, time: number): void {
    const confirmedFor = this.#confirmedAt === null ? null : this.#time - this.#confirmedAt;
    const center = gfx.width / 2;
    if (promptLit(time, confirmedFor)) {
      gfx.text('PRESS ANY BUTTON', center, LAYOUT.promptY, this.#services.text.prompt, { align: 'center' });
    }
    gfx.text('© 1996 LEENDERS CORP.', center, LAYOUT.copyrightY, this.#styles.copyright, { align: 'center' });
  }
}

/** Draws a painted word with its first letter's top-left at (x, y). */
function drawLine(gfx: Gfx, line: TitleLogoLine, x: number, y: number): void {
  gfx.image(line.image, x - line.origin.x, y - line.origin.y);
}

/** Where a settled word's shine image sits on screen. */
function placeShine(line: TitleLogoLine, at: { readonly x: number; readonly y: number }): GlintTarget {
  return { shine: line.shine, left: at.x - line.origin.x, top: at.y - line.origin.y };
}
