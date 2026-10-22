import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseHex } from '@/engine/gfx/color';
import { Gfx } from '@/engine/gfx/Gfx';
import { type Rect, rect } from '@/engine/math/Rect';
import { TITLE_LAYOUT } from '../../layout';
import { TITLE_TIMES } from '../../titleTimeline';
import { resolveTitleVariants } from '../../variants';
import type { BackdropArt, TitleFrame } from '../TitleBackdrop';
import { blueprintBackdrop } from '.';
import { BOOT_FRAMES, ripple, SETTLED_FRAMES, scanProgress } from './timeline';

/**
 * A canvas that keeps its pixels, standing in for the DOM the test runner
 * lacks: just the calls the backdrop makes, solid fills and same-size
 * copies, with transparent source pixels left out.
 */
class RasterCanvas {
  width = 0;
  height = 0;
  #context: RasterContext | null = null;

  getContext(): RasterContext {
    this.#context ??= new RasterContext(this);
    return this.#context;
  }
}

class RasterContext {
  readonly canvas: RasterCanvas;
  readonly data: Uint8ClampedArray;
  fillStyle = '#000000';
  imageSmoothingEnabled = false;
  #x = 0;
  #y = 0;
  readonly #saved: [number, number][] = [];

  constructor(canvas: RasterCanvas) {
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }

  save(): void {
    this.#saved.push([this.#x, this.#y]);
  }

  restore(): void {
    [this.#x, this.#y] = this.#saved.pop() ?? [this.#x, this.#y];
  }

  translate(x: number, y: number): void {
    this.#x += x;
    this.#y += y;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const { r, g, b, a } = parseHex(this.fillStyle);
    const pixel = Uint8ClampedArray.of(r, g, b, a);
    this.#blit(pixel, 0, 0, 0, w, h, x, y);
  }

  createImageData(width: number, height: number): ImageData {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }

  putImageData(image: ImageData, x: number, y: number): void {
    this.#blit(image.data, image.width, 0, 0, image.width, image.height, x, y);
  }

  drawImage(image: RasterCanvas, ...args: number[]): void {
    const [sx = 0, sy = 0, sw = image.width, sh = image.height, dx = 0, dy = 0] =
      args.length === 8 ? args : [0, 0, image.width, image.height, ...args];
    this.#blit(image.getContext().data, image.width, sx, sy, sw, sh, dx, dy);
  }

  /**
   * Copies a w × h block of `source` from (sx, sy) to (x, y), skipping
   * transparent pixels and anything off the canvas. A zero `stride` repeats
   * one source pixel, which is how a solid fill comes through here too.
   */
  #blit(source: Uint8ClampedArray, stride: number, sx: number, sy: number, w: number, h: number, x: number, y: number) {
    const { data } = this;
    const { width, height } = this.canvas;
    const [left, top] = [x + this.#x, y + this.#y];
    for (let j = Math.max(0, -top); j < h && top + j < height; j++) {
      for (let i = Math.max(0, -left); i < w && left + i < width; i++) {
        const from = stride === 0 ? 0 : ((sy + j) * stride + sx + i) * 4;
        if (source[from + 3] === 0) continue;
        const to = ((top + j) * width + left + i) * 4;
        data[to] = source[from] as number;
        data[to + 1] = source[from + 1] as number;
        data[to + 2] = source[from + 2] as number;
        data[to + 3] = source[from + 3] as number;
      }
    }
  }
}

const { screen, impact } = TITLE_LAYOUT;
const settledFrame = Math.round(TITLE_TIMES.settled * 60);
/** The middle columns the prompt and copyright are centred in, a little beyond their lettering. */
const PROMPT = rect(96, TITLE_LAYOUT.promptY - 2, 128, 16);
const COPYRIGHT = rect(96, TITLE_LAYOUT.copyrightY - 2, 128, 14);
/** The most any lockup may cover: lockups settle on screen and above the prompt. */
const LARGEST_LOCKUP = rect(0, 0, screen.width, TITLE_LAYOUT.promptY);

let art: BackdropArt;
let lockupBounds: Rect;
let screenContext: RasterContext;
let gfx: Gfx;

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new RasterCanvas() });
  const canvas = new RasterCanvas();
  canvas.width = screen.width;
  canvas.height = screen.height;
  screenContext = canvas.getContext();
  gfx = new Gfx(screenContext as unknown as CanvasRenderingContext2D, screen.width, screen.height);
  art = blueprintBackdrop.prepare();
  lockupBounds = resolveTitleVariants(undefined).lockup.prepare().bounds;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** The backdrop's pixels `frame` frames into the intro, around the default lockup unless told otherwise. */
function render(frame: number, reducedMotion = false, bounds = lockupBounds): Uint8ClampedArray {
  screenContext.data.fill(0);
  const title: TitleFrame = {
    time: frame / 60,
    beats: TITLE_TIMES,
    reducedMotion,
    screen,
    impact,
    lockupBounds: bounds,
  };
  art.drawBehind(gfx, title);
  return screenContext.data.slice();
}

/** A fingerprint of the pixels in a box, so whole frames compare cheaply. */
function fingerprint(pixels: Uint8ClampedArray, { x, y, w, h }: Rect): number {
  let hash = 0x811c9dc5;
  for (let j = Math.max(0, y); j < Math.min(screen.height, y + h); j++) {
    for (let i = Math.max(0, x) * 4; i < Math.min(screen.width, x + w) * 4; i++) {
      hash = Math.imul(hash ^ (pixels[j * screen.width * 4 + i] as number), 0x01000193);
    }
  }
  return hash >>> 0;
}

function meanBrightness(pixels: Uint8ClampedArray): number {
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) total += (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
  return total / (pixels.length / 4) / 3;
}

function whiteHotPixels(pixels: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255) count++;
  return count;
}

/** Settled frames with neither the lock's ripple nor the scan line passing: the plotter alone moves. */
function quietSettledFrames(reducedMotion: boolean): number[] {
  return Array.from({ length: SETTLED_FRAMES / 6 }, (_, i) => settledFrame + i * 6).filter(
    (frame) =>
      ripple(frame, TITLE_TIMES, reducedMotion) === null && scanProgress(frame - settledFrame, reducedMotion) === null,
  );
}

describe('blueprint backdrop, pixel for pixel', () => {
  it('paints every frame as a pure function of it, whatever was drawn before', () => {
    const frames = [0, 5, BOOT_FRAMES, 40, 60, 72, 80, settledFrame, settledFrame + 200, settledFrame + 700];
    const whole = rect(0, 0, screen.width, screen.height);
    const forwards = frames.map((frame) => fingerprint(render(frame), whole));
    const backwards = frames.toReversed().map((frame) => fingerprint(render(frame), whole));
    expect(backwards.toReversed()).toEqual(forwards);
    expect(new Set(forwards).size).toBe(frames.length);
  });

  it('strikes white-hot on a dark sheet, then has the whole sheet lit', () => {
    const strike = render(0);
    const centre = (impact.y * screen.width + impact.x) * 4;
    expect([...strike.slice(centre, centre + 3)]).toEqual([255, 255, 255]);
    const lit = render(BOOT_FRAMES);
    expect(meanBrightness(lit)).toBeGreaterThan(meanBrightness(strike) * 1.8);
  });

  it.each([false, true])('keeps every idle motion out from behind the lockup (reduced motion: %s)', (reduced) => {
    const frames = quietSettledFrames(reduced);
    const still = fingerprint(render(frames[0] ?? 0, reduced), lockupBounds);
    for (const frame of frames) expect(fingerprint(render(frame, reduced), lockupBounds), `frame ${frame}`).toBe(still);
  });

  it('keeps idle motion out from behind any lockup that settles above the prompt', () => {
    const frames = quietSettledFrames(false);
    const still = fingerprint(render(frames[0] ?? 0, false, LARGEST_LOCKUP), LARGEST_LOCKUP);
    for (const frame of frames) {
      expect(fingerprint(render(frame, false, LARGEST_LOCKUP), LARGEST_LOCKUP), `frame ${frame}`).toBe(still);
    }
  });

  it('never draws behind the prompt or the copyright once settled', () => {
    const frames = quietSettledFrames(false);
    const first = render(frames[0] ?? 0);
    const [prompt, copyright] = [fingerprint(first, PROMPT), fingerprint(first, COPYRIGHT)];
    for (const frame of frames) {
      const pixels = render(frame);
      expect(fingerprint(pixels, PROMPT), `frame ${frame}`).toBe(prompt);
      expect(fingerprint(pixels, COPYRIGHT), `frame ${frame}`).toBe(copyright);
    }
  });

  it('never flashes under reduced motion: no frame has more than a pen tip of white-hot', () => {
    const intro = Array.from({ length: settledFrame + 30 }, (_, frame) => frame);
    const idle = Array.from({ length: SETTLED_FRAMES / 6 }, (_, i) => settledFrame + 30 + i * 6);
    for (const frame of [...intro, ...idle]) {
      expect(whiteHotPixels(render(frame, true)), `frame ${frame}`).toBeLessThanOrEqual(5);
    }
  });
});
