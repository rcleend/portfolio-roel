import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { context2d } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { arcadeFont } from '@/game/art/fonts/arcade';
import { smallFont } from '@/game/art/fonts/small';
import { figureHeight } from '@/game/art/looks/Looks';
import { palette } from '@/game/palette';
import chaserJson from './art/chaser.json';
import chaserPng from './art/chaser.png?inline';
import runnerJson from './art/runner.json';
import runnerPng from './art/runner.png?inline';
import { BAR_SEGMENTS, litSegments, percentLabel } from './loadingBar';

/** Native size of the loading vignette; the page scales it by whole numbers. */
export const LOADING_ART_WIDTH = 160;
export const LOADING_ART_HEIGHT = 96;

const GROUND_Y = 50;
const RUNNER_X = 104;
const CHASER_X = 60;
// px/s: the pace both strips plant their feet at (the Terraria run and the customer's walk), so neither skates.
const GROUND_SPEED = 30;
// 20 segments of 4 px with 1 px gaps, plus a 1 px frame and 1 px padding each side.
const BAR = { x: 28, y: 74, w: 103, h: 9 } as const;
const SEGMENT_W = 4;
const SEGMENT_GAP = 1;

const RUNNER_ANIMATIONS = ['run', 'victory', 'hurt'] as const;
const CHASER_ANIMATIONS = ['walk', 'shout', 'happy'] as const;
type RunnerAnimation = (typeof RUNNER_ANIMATIONS)[number];
type ChaserAnimation = (typeof CHASER_ANIMATIONS)[number];

interface Actors {
  readonly runner: SpriteSheet<RunnerAnimation>;
  readonly chaser: SpriteSheet<ChaserAnimation>;
  /** How high over his feet the customer's head reaches, which the bubble and the heart float over. */
  readonly chaserHead: number;
}

let actors: Promise<Actors> | null = null;

/** Decodes the inlined strips, once per page however often the screen mounts. */
function decodeActors(): Promise<Actors> {
  actors ??= Promise.all([
    actorSheet(runnerPng, runnerJson, 'runner', RUNNER_ANIMATIONS),
    actorSheet(chaserPng, chaserJson, 'chaser', CHASER_ANIMATIONS),
  ]).then(([runner, chaser]) => ({ runner, chaser, chaserHead: figureHeight(chaser, 'walk') }));
  return actors;
}

async function actorSheet<A extends string>(
  png: string,
  json: unknown,
  name: string,
  animations: readonly A[],
): Promise<SpriteSheet<A>> {
  const image = new Image();
  image.src = png;
  await image.decode();
  const sheet = SpriteSheet.fromImage(image, parseSpriteSheetSpec(json, `${name}.json`), `loading/${name}`);
  if (!sheet.hasAll(animations)) throw new Error(`loading/${name}: the strip needs ${animations.join(', ')}`);
  return sheet;
}

/**
 * The "NOW LOADING" vignette, a nod to Neo Geo CD loading screens: Roel runs
 * from an Unhappy Customer over a scrolling floor while a segmented bar
 * fills; when loading completes the customer is won over. Drawn with the
 * game's glyph fonts (no web-font wait) and its shipped characters, cut from
 * their sheets into small strips inlined in this chunk
 * (`tools/looks/terraria/loading.py`), so it matches the game pixel for pixel
 * without waiting on a look. The strips decode in a few milliseconds, well
 * inside the screen's appear delay; until then the floor and bar draw alone.
 */
export class LoadingArt {
  readonly #gfx: Gfx;
  #actors: Actors | null = null;
  /** Settles once the characters can be drawn, or cannot be, e.g. to redraw a still frame with them. */
  readonly ready: Promise<void>;
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
    this.ready = decodeActors().then(
      (decoded) => {
        this.#actors = decoded;
      },
      // Strips a browser cannot decode leave the floor and bar to run alone; the vignette is only a nod.
      () => {},
    );
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
    if (!this.#actors) return;
    const gfx = this.#gfx;
    const { runner, chaser, chaserHead } = this.#actors;
    const running: RunnerAnimation = failed ? 'hurt' : done ? 'victory' : 'run';
    gfx.sprite(runner, running, time, RUNNER_X, GROUND_Y);
    // The customer stops to shout every few seconds, then gives chase again.
    const shouting = !done && !failed && time % 3.2 > 2.4;
    const chasing: ChaserAnimation = done ? 'happy' : shouting || failed ? 'shout' : 'walk';
    gfx.sprite(chaser, chasing, time, CHASER_X, GROUND_Y);
    // The bubble floats over his head, and the heart takes its place once he is won over.
    const overhead = GROUND_Y - chaserHead - 16;
    if (shouting) this.#drawBubble(CHASER_X + 6, overhead);
    if (done) this.#drawHeart(CHASER_X + 2, overhead);
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
