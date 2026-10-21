import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { condensedType, rclMonogram, reoLeoWordmark } from '../../art/logos';
import type { Mask } from '../../art/logos/raster/Mask';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import type { GameScene, GameStep } from '../params';
import { prepareTitleArt } from '../title/art';
import {
  BLACKOUT_SECONDS,
  BOOT_TIMES,
  backgroundColor,
  charsTypedBetween,
  logoPose,
  markColor,
  skippableFrom,
  TYPED_LINES,
  typedCounts,
} from './bootTimeline';
import { drawResampled } from './resample';

/**
 * Vertical layout of the lockup, modelled on the MVS screen: logo, two typed
 * lines, publisher mark — the whole block sitting a touch below centre.
 */
const LAYOUT = {
  centerX: 160,
  logoCenterY: 81,
  firstLineY: 121,
  lineHeight: 15,
  markY: 171,
} as const;

/** Unflipped identity pose, for drawing a mask at rest through the same resampler. */
const AT_REST = { scaleX: 1, scaleY: 1, mirrored: false } as const;

/**
 * "REO·LEO" — a frame-by-frame homage to the Neo Geo MVS boot
 * (docs/ART-DIRECTION.md › Boot). The choreography lives in `bootTimeline`;
 * this scene only plays it, ticks the typewriter, handles skipping and hands
 * over to the title through a short black screen.
 */
export class BootScene implements GameScene {
  readonly #services: GameServices;
  readonly #wordmark: Mask;
  readonly #monogram: Mask;
  readonly #typeStyle: TextStyle;
  readonly #skippableFrom: number;
  #time = 0;
  /** When the screen goes black; a skip pulls it forward. */
  #exitAt: number = BOOT_TIMES.end;
  #left = false;

  constructor(services: GameServices) {
    this.#services = services;
    this.#wordmark = reoLeoWordmark();
    this.#monogram = rclMonogram();
    this.#typeStyle = { font: condensedType(), fill: palette.white };
    this.#skippableFrom = skippableFrom(services.session.state.bootSeen);
  }

  enter(): void {
    this.#services.audio.playMusic('boot', { loop: false });
  }

  exit(): void {
    this.#services.session.update((state) => ({ ...state, bootSeen: true }));
  }

  update(step: GameStep): void {
    const previous = this.#time;
    this.#time += step.dt;
    if (this.#time < this.#exitAt) {
      for (const char of charsTypedBetween(previous, this.#time)) {
        if (char !== ' ') this.#services.audio.playSfx('typewriter');
      }
      if (step.input.anyPressed && this.#time >= this.#skippableFrom) this.#exitAt = this.#time;
      return;
    }
    // The black frames hide the one-off cost of painting the title; later calls are free.
    prepareTitleArt();
    if (!this.#left && this.#time >= this.#exitAt + BLACKOUT_SECONDS) {
      this.#left = true;
      this.#services.director.goTo('title');
    }
  }

  render(gfx: Gfx): void {
    const time = this.#time;
    if (time >= this.#exitAt) {
      gfx.clear(palette.black);
      return;
    }
    gfx.clear(backgroundColor(time));
    const pose = logoPose(time);
    drawResampled(gfx, this.#wordmark, LAYOUT.centerX, LAYOUT.logoCenterY, pose, pose.color);
    this.#renderTypedLines(gfx, time);
    const mark = markColor(time);
    if (mark) {
      const centerY = LAYOUT.markY + this.#monogram.height / 2;
      drawResampled(gfx, this.#monogram, LAYOUT.centerX, centerY, AT_REST, mark);
    }
  }

  /** Each line is placed by its full width, so typing fills in from the left without the line shifting. */
  #renderTypedLines(gfx: Gfx, time: number): void {
    const counts = typedCounts(time);
    TYPED_LINES.forEach((line, index) => {
      const shown = counts[index] ?? 0;
      if (shown === 0) return;
      const left = LAYOUT.centerX - Math.floor(gfx.measureText(line, this.#typeStyle).width / 2);
      gfx.text(line.slice(0, shown), left, LAYOUT.firstLineY + index * LAYOUT.lineHeight, this.#typeStyle);
    });
  }
}
