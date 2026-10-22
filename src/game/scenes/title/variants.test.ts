import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nullContext } from '@/engine/core/testing';
import { Gfx } from '@/engine/gfx/Gfx';
import { type Rect, rect, union } from '@/engine/math/Rect';
import { frames } from '@/engine/motion/progress';
import { type BackdropArt, TITLE_BACKDROPS, type TitleFrame } from './backdrops';
import { drawGlint } from './glint';
import { TITLE_LAYOUT } from './layout';
import { TITLE_LOCKUPS } from './lockups';
import type { TitleVariant } from './TitleVariant';
import { ATTRACT_AFTER_SECONDS, SLIDE_DISTANCE, TITLE_TIMES } from './titleTimeline';
import { prepareTitle, resolveTitleVariants, TITLE_DEFAULTS } from './variants';

const { slideStart, slideEnd, flashStart, settled } = TITLE_TIMES;
/** Every beat of the intro, then the idle loop up to the last frame before the attract loop replays it. */
const INTRO_TIMES = [
  0,
  frames(1),
  0.15,
  0.3,
  0.6,
  slideStart,
  (slideStart + slideEnd) / 2,
  slideEnd,
  flashStart,
  settled,
  settled + 1,
  settled + 7.7,
  settled + ATTRACT_AFTER_SECONDS - frames(1),
];
/** The whole slide, from off-screen to settled. */
const TRAVELS = [SLIDE_DISTANCE, 200, 80, 12, 1.5, 0];
const SCREEN = rect(0, 0, TITLE_LAYOUT.screen.width, TITLE_LAYOUT.screen.height);
const REGISTRIES: readonly (readonly [string, readonly TitleVariant[]])[] = [
  ['lockups', TITLE_LOCKUPS],
  ['backdrops', TITLE_BACKDROPS],
];

interface Recording {
  readonly gfx: Gfx;
  /** Every context call and property write, in order. */
  readonly calls: unknown[][];
  /** Where each image and filled rectangle landed on screen. */
  readonly boxes: Rect[];
}

/** A screen that remembers what was drawn and where, following translates, scales, saves and restores. */
function recordScreen(): Recording {
  const calls: unknown[][] = [];
  const boxes: Rect[] = [];
  let state = { globalAlpha: 1, x: 0, y: 0, sx: 1, sy: 1 };
  const saved: (typeof state)[] = [];
  const land = (x: number, y: number, w: number, h: number): void => {
    const [x0, x1] = [state.x + state.sx * x, state.x + state.sx * (x + w)];
    const [y0, y1] = [state.y + state.sy * y, state.y + state.sy * (y + h)];
    boxes.push(rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)));
  };
  const effects: Readonly<Record<string, (...args: number[]) => void>> = {
    save: () => saved.push({ ...state }),
    restore: () => {
      state = saved.pop() ?? state;
    },
    translate: (x, y) => {
      state = { ...state, x: state.x + state.sx * x, y: state.y + state.sy * y };
    },
    scale: (sx, sy) => {
      state = { ...state, sx: state.sx * sx, sy: state.sy * sy };
    },
    fillRect: (x, y, w, h) => land(x, y, w, h),
  };
  // drawImage(image, dx, dy), (image, dx, dy, dw, dh) or (image, sx, sy, sw, sh, dx, dy, dw, dh).
  const drawImage = (image: { readonly width: number; readonly height: number }, ...rest: number[]): void => {
    const [dx = 0, dy = 0, dw = image.width, dh = image.height] = rest.length === 8 ? rest.slice(4) : rest;
    land(dx, dy, dw, dh);
  };
  const properties: Record<string | symbol, unknown> = { canvas: { width: SCREEN.w, height: SCREEN.h } };
  const context = new Proxy(properties, {
    get: (target, key) => {
      if (key === 'globalAlpha') return state.globalAlpha;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'drawImage') drawImage(...(args as Parameters<typeof drawImage>));
        else if (typeof key === 'string') effects[key]?.(...(args as number[]));
      };
    },
    set: (target, key, value) => {
      calls.push([key, '=', value]);
      if (key === 'globalAlpha') state = { ...state, globalAlpha: value as number };
      else target[key] = value;
      return true;
    },
  });
  return { gfx: new Gfx(context as unknown as CanvasRenderingContext2D, SCREEN.w, SCREEN.h), calls, boxes };
}

/** Every intro time, with and without reduced motion, around a lockup settled in `lockupBounds`. */
function sampleFrames(lockupBounds: Rect): TitleFrame[] {
  const { screen, impact } = TITLE_LAYOUT;
  return [false, true].flatMap((reducedMotion) =>
    INTRO_TIMES.map((time) => ({ time, beats: TITLE_TIMES, reducedMotion, screen, impact, lockupBounds })),
  );
}

function drawFrame(art: BackdropArt, gfx: Gfx, frame: TitleFrame): void {
  art.drawBehind(gfx, frame);
  art.drawInFront?.(gfx, frame);
}

/** Draw calls made by `draw`, so two runs can be compared. */
function callsOf(recording: Recording, draw: () => void): unknown[][] {
  const start = recording.calls.length;
  draw();
  return recording.calls.slice(start);
}

// Variants paint into canvases; without a DOM these take the pixels and keep none.
beforeAll(() => {
  let created = 0;
  vi.stubGlobal('document', {
    createElement: () => ({ id: created++, width: 0, height: 0, getContext: () => nullContext() }),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// Unseeded randomness would make every screenshot different.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(() => {
    throw new Error('Title variants use seeded randomness (Rng, hash2, valueNoise), never Math.random');
  });
});

describe('title variant registries', () => {
  it.each(REGISTRIES)('list %s under unique kebab-case ids, each with a name and a one-line description', (_, list) => {
    const ids = list.map((variant) => variant.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const variant of list) {
      expect(variant.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(variant.name.trim()).not.toBe('');
      expect(variant.description.trim()).not.toBe('');
      expect(variant.description).not.toContain('\n');
    }
  });
});

describe('title params', () => {
  it('fill whatever they leave out from TITLE_DEFAULTS', () => {
    const defaults = resolveTitleVariants(undefined);
    expect(defaults.lockup.id).toBe(TITLE_DEFAULTS.lockup);
    expect(defaults.backdrop.id).toBe(TITLE_DEFAULTS.backdrop);
    expect(resolveTitleVariants({})).toEqual(defaults);
    for (const backdrop of TITLE_BACKDROPS) {
      expect(resolveTitleVariants({ backdrop: backdrop.id })).toEqual({ lockup: defaults.lockup, backdrop });
    }
    for (const lockup of TITLE_LOCKUPS) {
      expect(resolveTitleVariants({ lockup: lockup.id })).toEqual({ lockup, backdrop: defaults.backdrop });
    }
  });

  it('reject anything unknown with a message that names what exists', () => {
    const { lockup, backdrop } = TITLE_DEFAULTS;
    expect(() => resolveTitleVariants({ backdrop: 'volcano' })).toThrow(
      new RegExp(`unknown backdrop "volcano"; registered backdrops: .*"${backdrop}"`),
    );
    expect(() => resolveTitleVariants({ lockup: 7 })).toThrow(
      new RegExp(`unknown lockup 7; registered lockups: .*"${lockup}"`),
    );
    expect(() => resolveTitleVariants({ backdorp: backdrop })).toThrow(
      /unknown key "backdorp"; expected lockup or backdrop/,
    );
    expect(() => resolveTitleVariants(backdrop)).toThrow(/must be an object/);
  });

  it('let the boot paint the default title before it hands over', () => {
    const { lockup, backdrop } = resolveTitleVariants(undefined);
    const lockupPrepared = vi.spyOn(lockup, 'prepare');
    const backdropPrepared = vi.spyOn(backdrop, 'prepare');
    prepareTitle();
    expect(lockupPrepared).toHaveBeenCalledOnce();
    expect(backdropPrepared).toHaveBeenCalledOnce();
  });
});

describe.each(TITLE_LOCKUPS)('lockup "$id"', (lockup) => {
  it('paints once and hands out the same art afterwards', () => {
    expect(lockup.prepare()).toBe(lockup.prepare());
  });

  it('slides in as a pure function of the distance still to travel', () => {
    const art = lockup.prepare();
    const screen = recordScreen();
    const draw = (travel: number): unknown[][] => callsOf(screen, () => art.draw(screen.gfx, travel));
    const forwards = TRAVELS.map(draw);
    expect(TRAVELS.toReversed().map(draw).toReversed()).toEqual(forwards);
  });

  it('settles inside its bounds, which fit on screen above the prompt', () => {
    const art = lockup.prepare();
    const { gfx, boxes } = recordScreen();
    art.draw(gfx, 0);
    expect(boxes.length).toBeGreaterThan(0);
    expect(union(art.bounds, boxes.reduce(union))).toEqual(art.bounds);
    expect(union(SCREEN, art.bounds)).toEqual(SCREEN);
    expect(art.bounds.y + art.bounds.h).toBeLessThanOrEqual(TITLE_LAYOUT.promptY);
  });

  it('gives the glint letters to light, all within its bounds', () => {
    const art = lockup.prepare();
    const { gfx, boxes } = recordScreen();
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) drawGlint(gfx, art.glint.targets, progress, art.glint.pivotY);
    expect(boxes.length).toBeGreaterThan(0);
    expect(union(art.bounds, boxes.reduce(union))).toEqual(art.bounds);
  });
});

describe.each(TITLE_BACKDROPS)('backdrop "$id"', (backdrop) => {
  it('paints once and hands out the same art afterwards', () => {
    expect(backdrop.prepare()).toBe(backdrop.prepare());
  });

  it.each(TITLE_LOCKUPS)('draws every beat around lockup "$id", with and without reduced motion', (lockup) => {
    const art = backdrop.prepare();
    const { gfx } = recordScreen();
    for (const frame of sampleFrames(lockup.prepare().bounds)) {
      const at = `at ${frame.time.toFixed(3)} s${frame.reducedMotion ? ' with reduced motion' : ''}`;
      expect(() => drawFrame(art, gfx, frame), at).not.toThrow();
    }
  });

  it('draws every frame as a pure function of it, whatever came before', () => {
    const art = backdrop.prepare();
    const screen = recordScreen();
    const sample = sampleFrames(resolveTitleVariants(undefined).lockup.prepare().bounds);
    const draw = (frame: TitleFrame): unknown[][] => callsOf(screen, () => drawFrame(art, screen.gfx, frame));
    const forwards = sample.map(draw);
    expect(sample.toReversed().map(draw).toReversed()).toEqual(forwards);
  });
});
