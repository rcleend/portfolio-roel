import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { context2d } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { type CharacterAnimation, type CustomerAnimation, characterSheets, unhappyCustomerSheet } from '@/game/art';
import { arcadeFont } from '@/game/art/fonts/arcade';
import { smallFont } from '@/game/art/fonts/small';
import { palette } from '@/game/palette';
import { BAR_SEGMENTS, litSegments, percentLabel } from './loadingBar';

/** Native size of the loading vignette; the page scales it by whole numbers. */
export const LOADING_ART_WIDTH = 160;
export const LOADING_ART_HEIGHT = 96;

const GROUND_Y = 50;
const RUNNER_X = 104;
const CHASER_X = 60;
const GROUND_SPEED = 54; // px/s, matched to the run cycle so the feet do not skate
// 20 segments of 4 px with 1 px gaps, plus a 1 px frame and 1 px padding each side.
const BAR = { x: 28, y: 74, w: 103, h: 9 } as const;
const SEGMENT_W = 4;
const SEGMENT_GAP = 1;

/**
 * The "NOW LOADING" vignette, a nod to Neo Geo CD loading screens: Roel runs
 * from an Unhappy Customer over a scrolling floor while a segmented bar
 * fills; when loading completes the customer is won over. Drawn with the
 * game's own sprites and glyph fonts (no web-font wait), so it is on screen
 * from the very first frame and matches the game pixel for pixel.
 */
export class LoadingArt {
  readonly #gfx: Gfx;
  readonly #runner = SpriteSheet.compile(characterSheets.hackerman, 'loading/hackerman');
  readonly #chaser = SpriteSheet.compile(unhappyCustomerSheet, 'loading/unhappy-customer');
  readonly #prompt: TextStyle;
  readonly #small: TextStyle;
  readonly #alert: TextStyle;

  constructor(canvas: HTMLCanvasElement) {
    this.#gfx = new Gfx(context2d(canvas), LOADING_ART_WIDTH, LOADING_ART_HEIGHT);
    const arcade = BitmapFont.fromGlyphData(arcadeFont);
    const small = BitmapFont.fromGlyphData(smallFont);
    this.#prompt = {
      font: arcade,
      fill: ['#ffffff', '#ffffff', '#e4defc', '#c4b8f5', '#a596e8'],
      bands: 5,
      outline: '#141048',
      shadow: { color: '#141048', x: 1, y: 1 },
    };
    this.#alert = { ...this.#prompt, fill: ['#fff3a0', '#ffc83d', '#ff9a1f', '#f06414', '#c83a10'] };
    this.#small = { font: small, fill: palette.lavender, shadow: { color: palette.ink, x: 1, y: 1 } };
  }

  /** Draws the frame for `time` seconds. `failed` swaps the chase for an error card. */
  draw(time: number, progress: number, failed: boolean): void {
    const gfx = this.#gfx;
    gfx.ctx.clearRect(0, 0, LOADING_ART_WIDTH, LOADING_ART_HEIGHT);
    const done = progress >= 1;
    this.#drawGround(time, done || failed);
    this.#drawActors(time, done, failed);
    if (failed) {
      gfx.text('LOAD ERROR', LOADING_ART_WIDTH / 2, 58, this.#alert, { align: 'center' });
      return;
    }
    // Three dots step in like a cursor; whole-frame changes, never a fade.
    const dots = '.'.repeat(Math.floor(time * 3) % 4);
    const label = 'NOW LOADING';
    const width = gfx.measureText(label, this.#prompt).width;
    const left = Math.round((LOADING_ART_WIDTH - width) / 2) - 4;
    gfx.text(label, left, 56, this.#prompt);
    gfx.text(dots, left + width + 2, 56, this.#prompt);
    this.#drawBar(progress);
    gfx.text(percentLabel(progress), LOADING_ART_WIDTH / 2, 87, this.#small, { align: 'center' });
  }

  #drawGround(time: number, stopped: boolean): void {
    const gfx = this.#gfx;
    gfx.fillRect(14, GROUND_Y, LOADING_ART_WIDTH - 28, 1, palette.violet);
    const offset = stopped ? 0 : Math.floor(time * GROUND_SPEED) % 8;
    for (let x = 14 - offset; x < LOADING_ART_WIDTH - 14; x += 8) {
      if (x >= 14) gfx.fillRect(x, GROUND_Y + 2, 3, 1, palette.indigo);
    }
    // Fade the floor's ends into the night with a single dither step.
    for (const x of [14, LOADING_ART_WIDTH - 15]) gfx.pixel(x, GROUND_Y, palette.indigo);
  }

  #drawActors(time: number, done: boolean, failed: boolean): void {
    const gfx = this.#gfx;
    const runner: CharacterAnimation = failed ? 'hurt' : done ? 'victory' : 'run';
    gfx.sprite(this.#runner, runner, time, RUNNER_X, GROUND_Y);
    // The customer stops to shout every few seconds, then gives chase again.
    const shouting = !done && !failed && time % 3.2 > 2.4;
    const chaser: CustomerAnimation = done ? 'happy' : shouting || failed ? 'shout' : 'walk';
    gfx.sprite(this.#chaser, chaser, time, CHASER_X, GROUND_Y);
    if (shouting) this.#drawBubble(CHASER_X + 6, GROUND_Y - 46);
    if (done) this.#drawHeart(CHASER_X + 2, GROUND_Y - 50);
  }

  #drawBubble(x: number, y: number): void {
    const gfx = this.#gfx;
    gfx.fillRect(x, y, 11, 9, palette.white);
    gfx.rect(x - 1, y - 1, 13, 11, palette.ink);
    gfx.fillRect(x + 1, y + 9, 2, 2, palette.white);
    gfx.pixel(x, y + 10, palette.ink);
    gfx.pixel(x + 1, y + 11, palette.ink);
    gfx.fillRect(x + 4, y + 1, 3, 4, palette.red);
    gfx.fillRect(x + 4, y + 6, 3, 2, palette.red);
  }

  #drawHeart(x: number, y: number): void {
    const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] === '#') this.#gfx.pixel(x + dx, y + dy, dy === 0 && dx < 3 ? '#ff9db4' : '#ff4f7b');
      }
    });
  }

  #drawBar(progress: number): void {
    const gfx = this.#gfx;
    gfx.fillRect(BAR.x, BAR.y, BAR.w, BAR.h, palette.ink);
    gfx.rect(BAR.x, BAR.y, BAR.w, BAR.h, palette.lavender);
    // Bevel: a darker inner rim on the bottom-right, like the game's windows.
    gfx.fillRect(BAR.x + 1, BAR.y + BAR.h - 2, BAR.w - 2, 1, palette.navy);
    const lit = litSegments(progress);
    for (let i = 0; i < BAR_SEGMENTS; i++) {
      const x = BAR.x + 2 + i * (SEGMENT_W + SEGMENT_GAP);
      if (i < lit) {
        gfx.fillRect(x, BAR.y + 2, SEGMENT_W, BAR.h - 4, {
          stops: ['#fff3a0', '#ffc83d', '#ff9a1f'],
          bands: 3,
        });
      } else {
        gfx.fillRect(x, BAR.y + 2, SEGMENT_W, BAR.h - 4, palette.navy);
      }
    }
  }
}
