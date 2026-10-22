import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nullContext } from '@/engine/core/testing';
import { TITLE_LAYOUT } from '../../layout';
import { resolveTitleVariants } from '../../variants';
import { BARS, CHART } from './layout';
import { BAR_STATES, barStates, barX, buildTrace } from './series';

// The default lockup paints into canvases; without a DOM these take the pixels and keep none.
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => nullContext() }) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('the hockey stick', () => {
  const trace = buildTrace();
  const { pixels, elbow, breach } = trace;

  it('is one unbroken 1 px line that only ever runs to the right', () => {
    for (let i = 1; i < pixels.length; i++) {
      const [from, to] = [pixels[i - 1], pixels[i]];
      const dx = (to?.x ?? 0) - (from?.x ?? 0);
      const dy = Math.abs((to?.y ?? 0) - (from?.y ?? 0));
      expect(dx === 0 || dx === 1, `step ${i}`).toBe(true);
      expect(dy <= 1 && dx + dy > 0, `step ${i}`).toBe(true);
    }
  });

  it('runs from the y axis to the ceiling', () => {
    expect(pixels[0]?.x).toBe(CHART.left);
    expect(breach).toEqual(pixels[pixels.length - 1]);
    expect(breach.y).toBe(CHART.top);
  });

  it("runs flat between the default logo's bottom edge and the prompt, sagging into a trough before it turns", () => {
    const logo = resolveTitleVariants(undefined).lockup.prepare().bounds;
    const flat = pixels.slice(0, elbow + 1);
    // Its ring and bloom reach two pixels either side of the 1 px core.
    for (const { y } of flat) {
      expect(y - 2).toBeGreaterThanOrEqual(logo.y + logo.h);
      expect(y + 2).toBeLessThan(TITLE_LAYOUT.promptY - 1);
    }
    const lowest = Math.max(...flat.map(({ y }) => y));
    const trough = flat.findIndex(({ y }) => y === lowest);
    expect(trough).toBeGreaterThan(flat.length / 2);
    expect(lowest).toBeGreaterThan(flat[0]?.y ?? 0);
  });

  it('turns into a blade that climbs faster the further right it gets', () => {
    const blade = pixels.slice(elbow);
    const rows = new Map<number, number[]>();
    for (const { x, y } of blade) rows.set(x, [...(rows.get(x) ?? []), y]);
    const climbs = [...rows.values()].map((ys) => Math.max(...ys) - Math.min(...ys));
    expect(climbs.slice(-3).every((climb) => climb > (climbs[0] ?? 0))).toBe(true);
  });
});

describe('the bars', () => {
  const states = barStates();

  it('have one value per idle state for every bar, the first being where the intro leaves them', () => {
    expect(states).toHaveLength(BAR_STATES);
    const count = states[0]?.length ?? 0;
    expect(states.every((state) => state.length === count)).toBe(true);
    expect(barX(count - 1) + BARS.width).toBeLessThanOrEqual(TITLE_LAYOUT.screen.width);
  });

  it('stay in their pane, below the prompt, at every value they take', () => {
    const tallest = Math.max(...states.flat());
    expect(BARS.floor - tallest).toBeGreaterThan(TITLE_LAYOUT.promptY + 14);
    expect(Math.min(...states.flat())).toBeGreaterThan(0);
  });

  it('are the same every time', () => {
    expect(barStates()).toEqual(states);
  });
});
