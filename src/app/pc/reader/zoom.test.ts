import { describe, expect, it } from 'vitest';
import {
  FIT_MAX,
  fitWidthScale,
  PAGE_WIDTH,
  parseZoomFieldValue,
  resolveZoom,
  sameZoom,
  type ZoomSetting,
  zoomFieldValue,
  zoomIn,
  zoomOut,
} from './zoom';

const percent = (scale: number): ZoomSetting => ({ kind: 'percent', scale });

describe('fitWidthScale', () => {
  it('fits the page width inside the pane with a grey gutter', () => {
    expect(fitWidthScale(PAGE_WIDTH + 24)).toBe(1);
    expect(fitWidthScale(835)).toBeCloseTo(1.0214, 4);
  });

  it('is capped on very wide panes and never negative', () => {
    expect(fitWidthScale(4000)).toBe(FIT_MAX);
    expect(fitWidthScale(0)).toBe(0);
  });
});

describe('resolveZoom', () => {
  it('scales the A4 pages for percentages and Fit Width', () => {
    expect(resolveZoom(percent(1.25), 800)).toEqual({ kind: 'pages', scale: 1.25 });
    expect(resolveZoom({ kind: 'fit-width' }, PAGE_WIDTH + 24)).toEqual({ kind: 'pages', scale: 1 });
  });

  it('switches to the reflowed layout for Reflow', () => {
    expect(resolveZoom({ kind: 'reflow' }, 800)).toEqual({ kind: 'reflow' });
  });
});

describe('zoom steps', () => {
  it('walks the field steps up and down', () => {
    expect(zoomIn(percent(1), 800)).toEqual(percent(1.25));
    expect(zoomOut(percent(1), 800)).toEqual(percent(0.75));
  });

  it('starts from the scale Fit Width or Reflow shows', () => {
    // A 1.02 fit steps to 1.25 in and 1 out.
    expect(zoomIn({ kind: 'fit-width' }, 835)).toEqual(percent(1.25));
    expect(zoomOut({ kind: 'fit-width' }, 835)).toEqual(percent(1));
    expect(zoomIn({ kind: 'reflow' }, 663)).toEqual(percent(1));
  });

  it('treats an exact step as that step', () => {
    expect(zoomIn({ kind: 'fit-width' }, PAGE_WIDTH + 24)).toEqual(percent(1.25));
  });

  it('stops at both ends', () => {
    expect(zoomIn(percent(2), 800)).toEqual(percent(2));
    expect(zoomOut(percent(0.5), 800)).toEqual(percent(0.5));
  });
});

describe('the zoom field', () => {
  it('round-trips every option', () => {
    for (const value of ['50', '75', '100', '125', '150', '200', 'fit-width', 'reflow']) {
      const setting = parseZoomFieldValue(value);
      expect(setting).not.toBeNull();
      if (setting) expect(zoomFieldValue(setting)).toBe(value);
    }
  });

  it('rejects values it does not offer', () => {
    expect(parseZoomFieldValue('110')).toBeNull();
    expect(parseZoomFieldValue('')).toBeNull();
  });

  it('compares settings by what the field shows', () => {
    expect(sameZoom(percent(1), percent(1))).toBe(true);
    expect(sameZoom({ kind: 'fit-width' }, percent(1))).toBe(false);
  });
});
