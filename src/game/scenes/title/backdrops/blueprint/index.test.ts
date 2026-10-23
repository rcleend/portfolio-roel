import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Gfx } from '@/engine/gfx/Gfx';
import { RasterCanvas, type RasterContext, rasterContext } from '@/engine/gfx/testing';
import { type Rect, rect } from '@/engine/math/Rect';
import { TITLE_LAYOUT } from '../../layout';
import { TITLE_TIMES } from '../../titleTimeline';
import { resolveTitleVariants } from '../../variants';
import type { BackdropArt, TitleFrame } from '../TitleBackdrop';
import { blueprintBackdrop } from '.';
import { BOOT_FRAMES, ripple, SETTLED_FRAMES, scanProgress } from './timeline';

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
  screenContext = rasterContext(screen.width, screen.height);
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
