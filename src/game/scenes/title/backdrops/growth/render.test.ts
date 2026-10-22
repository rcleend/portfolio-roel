import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nullContext } from '@/engine/core/testing';
import { Gfx } from '@/engine/gfx/Gfx';
import { intersects, type Rect, rect } from '@/engine/math/Rect';
import { TITLE_LAYOUT } from '../../layout';
import { TITLE_TIMES } from '../../titleTimeline';
import { resolveTitleVariants } from '../../variants';
import type { TitleFrame } from '../TitleBackdrop';
import { burstFrom } from './confetti';
import { LOOP_FRAMES } from './idle';
import { growthBackdrop } from './index';
import { buildTrace } from './series';
import { FPS, glassBoost, growthCues } from './timeline';

/**
 * Renders the backdrop frame by frame through a context that records what
 * lands where, to hold it to the rules a title backdrop lives by: drawing
 * is a pure function of the frame, and once settled nothing moves behind
 * the logo or the scene's lettering.
 */

const { screen, impact, promptY, copyrightY } = TITLE_LAYOUT;
const cues = growthCues(TITLE_TIMES);
/** Every frame from the opening hit to the last one before the attract loop replays the intro. */
const ALL_FRAMES = Array.from({ length: cues.settled + LOOP_FRAMES }, (_, frame) => frame);

/** One draw call: a key that tells calls apart, and the screen box it covers. */
interface Draw {
  readonly key: string;
  readonly box: Rect;
}

/** A stand-in canvas, as the stubbed `document` hands them out. */
interface StubCanvas {
  readonly id: number;
  readonly width: number;
  readonly height: number;
}

/** A screen that records every fill and blit with the box it covers, following translates, saves and restores. */
function recordingScreen(): { readonly gfx: Gfx; take(): Draw[] } {
  let draws: Draw[] = [];
  let origin = { x: 0, y: 0 };
  const saved: (typeof origin)[] = [];
  const land = (x: number, y: number, w: number, h: number): Rect => rect(origin.x + x, origin.y + y, w, h);
  const state: Record<string | symbol, unknown> = { canvas: { width: screen.width, height: screen.height } };
  const context = new Proxy(state, {
    get: (target, key) => {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        const [a = 0, b = 0, c = 0, d = 0] = args as number[];
        if (key === 'save') saved.push({ ...origin });
        else if (key === 'restore') origin = saved.pop() ?? origin;
        else if (key === 'translate') origin = { x: origin.x + a, y: origin.y + b };
        else if (key === 'fillRect')
          draws.push({ key: `fill ${String(target.fillStyle)} ${a},${b},${c},${d}`, box: land(a, b, c, d) });
        else if (key === 'drawImage') {
          const [image, ...at] = args as [StubCanvas, ...number[]];
          const [dx = 0, dy = 0, dw = image.width, dh = image.height] = at.length === 8 ? at.slice(4) : at;
          draws.push({ key: `blit ${image.id} ${at.join(',')}`, box: land(dx, dy, dw, dh) });
        }
      };
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  return {
    gfx: new Gfx(context as unknown as CanvasRenderingContext2D, screen.width, screen.height),
    take: () => {
      const taken = draws;
      draws = [];
      return taken;
    },
  };
}

beforeAll(() => {
  let created = 0;
  vi.stubGlobal('document', {
    createElement: (): StubCanvas & { getContext(): CanvasRenderingContext2D } => ({
      id: created++,
      width: 0,
      height: 0,
      getContext: () => nullContext(),
    }),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** The settled box of the lockup visitors see. */
function lockupBounds(): Rect {
  return resolveTitleVariants(undefined).lockup.prepare().bounds;
}

function render(recording: ReturnType<typeof recordingScreen>, frame: number, reducedMotion: boolean): Draw[] {
  const art = growthBackdrop.prepare();
  const title: TitleFrame = {
    time: frame / FPS,
    beats: TITLE_TIMES,
    reducedMotion,
    screen,
    impact,
    lockupBounds: lockupBounds(),
  };
  art.drawBehind(recording.gfx, title);
  art.drawInFront?.(recording.gfx, title);
  return recording.take();
}

describe('the growth backdrop, frame by frame', () => {
  it.each([false, true])(
    'draws every frame as a pure function of it, in any order (reduced motion: %s)',
    (reducedMotion) => {
      const recording = recordingScreen();
      const keys = (frame: number): string[] => render(recording, frame, reducedMotion).map((draw) => draw.key);
      const forwards = ALL_FRAMES.map(keys);
      expect(ALL_FRAMES.toReversed().map(keys).toReversed()).toEqual(forwards);
    },
  );

  it.each([false, true])(
    'keeps the idle loop still behind the prompt and copyright, and behind the logo once the burst is over (reduced motion: %s)',
    (reducedMotion) => {
      const recording = recordingScreen();
      const bounds = lockupBounds();
      const rows = (top: number, bottom: number): Rect => rect(0, top, screen.width, bottom - top);
      const lettering = [rows(promptY - 2, promptY + 14), rows(copyrightY - 2, copyrightY + 12)];
      const burstOver =
        cues.breach + Math.max(...burstFrom(buildTrace().breach, reducedMotion).map((piece) => piece.life));
      // The flash fades out through the whole tube's afterglow; the idle loop starts once the glass is at rest.
      const cooled = ALL_FRAMES.find((frame) => frame >= cues.settled && glassBoost(frame, cues, reducedMotion) === 0);
      expect(cooled).toBeLessThan(cues.settled + 15);
      let previous = render(recording, cooled ?? cues.settled, reducedMotion);
      let motion = 0;
      for (let frame = (cooled ?? cues.settled) + 1; frame < cues.settled + LOOP_FRAMES; frame++) {
        const draws = render(recording, frame, reducedMotion);
        // Whatever differs from the frame before is motion.
        const before = new Set(previous.map((draw) => draw.key));
        const after = new Set(draws.map((draw) => draw.key));
        const moved = [
          ...previous.filter((draw) => !after.has(draw.key)),
          ...draws.filter((draw) => !before.has(draw.key)),
        ];
        motion += moved.length;
        for (const draw of moved) {
          for (const row of lettering) expect(intersects(draw.box, row), `${draw.key} at frame ${frame}`).toBe(false);
          if (frame > burstOver) expect(intersects(draw.box, bounds), `${draw.key} at frame ${frame}`).toBe(false);
        }
        previous = draws;
      }
      // The loop is alive: the ticker, the bars and the badge do move.
      expect(motion).toBeGreaterThan(LOOP_FRAMES);
    },
  );
});
