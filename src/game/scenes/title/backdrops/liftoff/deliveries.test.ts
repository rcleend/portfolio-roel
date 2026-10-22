import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nullContext } from '@/engine/core/testing';
import { Gfx } from '@/engine/gfx/Gfx';
import { containsPoint } from '@/engine/math/Rect';
import { frames } from '@/engine/motion/progress';
import { TITLE_LOCKUPS } from '../../lockups';
import { ATTRACT_AFTER_SECONDS, GLINT, TITLE_TIMES } from '../../titleTimeline';
import { BURN_SECONDS, DELIVERIES, DELIVERY_SECONDS, type Delivery, deliveryAge, drawDelivery } from './deliveries';
import { KEEP_CLEAR, STAGE } from './layout';

/** The glint sweeps across the logo, as [start, end) in seconds after the title settles. */
const GLINTS = Array.from({ length: Math.ceil(ATTRACT_AFTER_SECONDS / GLINT.every) }, (_, i): [number, number] => {
  const start = GLINT.firstAfter + i * GLINT.every;
  return [start, start + GLINT.duration];
});

/** Every pixel a delivery draws over its whole life under a logo ending above `logoBottom`, in screen pixels. */
function pixelsOf(delivery: Delivery, logoBottom: number): { x: number; y: number }[] {
  const drawn: { x: number; y: number }[] = [];
  const context = nullContext();
  context.fillRect = (x: number, y: number) => drawn.push({ x, y });
  const gfx = new Gfx(context, STAGE.width, STAGE.height);
  for (let frame = 0; frame < DELIVERY_SECONDS * 60; frame++) drawDelivery(gfx, delivery, frames(frame), logoBottom);
  return drawn;
}

// Lockups paint into canvases; without a DOM these take the pixels and keep none.
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => nullContext() }) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('continuous delivery', () => {
  it('sends a rocket up from each city while the title idles, Berlin first', () => {
    const [berlin, sanFrancisco] = DELIVERIES;
    expect(berlin?.x).toBeLessThan(STAGE.pad.x);
    expect(sanFrancisco?.x).toBeGreaterThan(STAGE.pad.x);
    for (const delivery of DELIVERIES) {
      const launch = TITLE_TIMES.settled + delivery.after;
      expect(deliveryAge(delivery, launch - frames(1), TITLE_TIMES)).toBeNull();
      expect(deliveryAge(delivery, launch, TITLE_TIMES)).toBeCloseTo(0, 9);
      expect(deliveryAge(delivery, launch + DELIVERY_SECONDS, TITLE_TIMES)).toBeNull();
    }
  });

  it('never flies while a glint sweeps the logo, so only one thing catches the eye at a time', () => {
    for (const delivery of DELIVERIES) {
      const flight = [delivery.after, delivery.after + BURN_SECONDS] as const;
      for (const [start, end] of GLINTS)
        expect(flight[1] <= start || flight[0] >= end, `glint at ${start} s`).toBe(true);
    }
  });

  it('lets its trail cool away before the attract loop replays the intro', () => {
    for (const delivery of DELIVERIES)
      expect(delivery.after + DELIVERY_SECONDS).toBeLessThanOrEqual(ATTRACT_AFTER_SECONDS);
  });

  it('flies clear of the prompt and burns out under every logo', () => {
    for (const lockup of TITLE_LOCKUPS) {
      const bounds = lockup.prepare().bounds;
      const logoBottom = bounds.y + bounds.h;
      for (const delivery of DELIVERIES) {
        const drawn = pixelsOf(delivery, logoBottom);
        expect(drawn.length).toBeGreaterThan(0);
        for (const { x, y } of drawn) {
          expect(containsPoint(KEEP_CLEAR.prompt, x, y), `(${x}, ${y})`).toBe(false);
          expect(y, `under the ${lockup.id} lockup at (${x}, ${y})`).toBeGreaterThanOrEqual(logoBottom);
        }
      }
    }
  });
});
