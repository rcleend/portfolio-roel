import { describe, expect, it } from 'vitest';
import { crtPowerFrame, POWER_OFF_MS, POWER_ON_MS, powerDurationMs, REDUCED_POWER_MS } from './powerTimeline';

const sample = (state: 'powering-on' | 'powering-off', step = 10) =>
  Array.from({ length: Math.floor(powerDurationMs(state, false) / step) + 1 }, (_, i) =>
    crtPowerFrame(state, i * step, false),
  );

describe('crtPowerFrame', () => {
  it('is dark when off and a plain picture when on', () => {
    expect(crtPowerFrame('off', 0, false)).toMatchObject({ brightness: 0, lit: 0 });
    expect(crtPowerFrame('on', 0, false)).toEqual({ scaleX: 1, scaleY: 1, brightness: 1, flash: 0, roll: 0, lit: 1 });
  });

  it('powers on as a dot, then a line, then a full picture', () => {
    const dot = crtPowerFrame('powering-on', 60, false);
    expect(dot.scaleX).toBeLessThan(0.05);
    expect(dot.scaleY).toBeLessThan(0.05);
    expect(dot.flash).toBe(1);

    const line = crtPowerFrame('powering-on', 225, false);
    expect(line.scaleX).toBeGreaterThan(0.9);
    expect(line.scaleY).toBeLessThan(0.05);

    expect(crtPowerFrame('powering-on', POWER_ON_MS, false)).toEqual(crtPowerFrame('on', 0, false));
  });

  it('overshoots vertically while snapping open', () => {
    const peak = Math.max(...sample('powering-on').map((f) => f.scaleY));
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.2);
  });

  it('blooms brighter than normal before settling', () => {
    const frames = sample('powering-on');
    expect(Math.max(...frames.map((f) => f.brightness))).toBeGreaterThan(1.5);
    expect(frames.at(-1)?.brightness).toBe(1);
  });

  it('powers off by collapsing to a line, then a dot, then darkness', () => {
    const line = crtPowerFrame('powering-off', 140, false);
    expect(line.scaleY).toBeLessThan(0.02);
    expect(line.scaleX).toBeGreaterThan(0.9);
    const dot = crtPowerFrame('powering-off', 260, false);
    expect(dot.scaleX).toBeLessThan(0.05);
    expect(crtPowerFrame('powering-off', POWER_OFF_MS, false)).toEqual(crtPowerFrame('off', 0, false));
  });

  it('only fades under reduced motion', () => {
    expect(powerDurationMs('powering-on', true)).toBe(REDUCED_POWER_MS);
    const mid = crtPowerFrame('powering-on', REDUCED_POWER_MS / 2, true);
    expect(mid).toMatchObject({ scaleX: 1, scaleY: 1, flash: 0, roll: 0 });
    expect(mid.brightness).toBeCloseTo(0.5);
    expect(crtPowerFrame('powering-off', REDUCED_POWER_MS, true).brightness).toBe(0);
  });

  it('keeps light output within 0–1', () => {
    for (const f of [...sample('powering-on'), ...sample('powering-off')]) {
      expect(f.lit).toBeGreaterThanOrEqual(0);
      expect(f.lit).toBeLessThanOrEqual(1);
    }
  });
});
