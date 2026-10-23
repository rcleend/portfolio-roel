import { describe, expect, it } from 'vitest';
import { defaultZoom, desktopLayoutSize, layoutScale, presentationMode } from './presentation';
import { paneClientWidth } from './reader/readerMetrics';
import { fitWidthScale } from './reader/zoom';

/** Chromium's classic scrollbar, which the document pane always shows. */
const SCROLLBAR = 15;
/** Body text is 14 px on the A4 page. */
const bodyPx = (pictureWidth: number): number => {
  const layout = desktopLayoutSize({ width: pictureWidth, height: pictureWidth * 0.8 });
  return 14 * fitWidthScale(paneClientWidth(layout.width, SCROLLBAR)) * layout.scale;
};

describe('layoutScale', () => {
  it('never shrinks the chrome in the glass and grows it in quarter steps', () => {
    expect(layoutScale(600)).toBe(1);
    expect(layoutScale(874)).toBe(1);
    expect(layoutScale(1049)).toBe(1);
    expect(layoutScale(1125)).toBe(1.25);
    expect(layoutScale(1399)).toBe(1.5);
    expect(layoutScale(4000)).toBe(1.5);
  });

  it('shows the whole 800-wide desktop scaled down on small pictures', () => {
    expect(layoutScale(321)).toBeCloseTo(321 / 800, 10);
    expect(desktopLayoutSize({ width: 321, height: 252 })).toEqual({
      width: 800,
      height: 252 / (321 / 800),
      scale: 321 / 800,
    });
  });

  it('is defined for a zero-sized placement (the room before it is ready)', () => {
    expect(desktopLayoutSize({ width: 0, height: 0 })).toEqual({ width: 0, height: 0, scale: 1 });
  });

  it('divides the placement into layout px', () => {
    expect(desktopLayoutSize({ width: 1399, height: 1099 })).toEqual({
      width: 1399 / 1.5,
      height: 1099 / 1.5,
      scale: 1.5,
    });
  });
});

describe('presentationMode', () => {
  it('reads in the glass from 600 × 440 and pops out below', () => {
    expect(presentationMode({ width: 600, height: 440 }, null)).toBe('in-glass');
    expect(presentationMode({ width: 599, height: 500 }, null)).toBe('pop-out');
    expect(presentationMode({ width: 700, height: 439 }, null)).toBe('pop-out');
  });

  it('holds the current mode within 16 px of either threshold', () => {
    expect(presentationMode({ width: 585, height: 425 }, 'in-glass')).toBe('in-glass');
    expect(presentationMode({ width: 583, height: 500 }, 'in-glass')).toBe('pop-out');
    expect(presentationMode({ width: 700, height: 423 }, 'in-glass')).toBe('pop-out');
    expect(presentationMode({ width: 615, height: 500 }, 'pop-out')).toBe('pop-out');
    expect(presentationMode({ width: 616, height: 455 }, 'pop-out')).toBe('pop-out');
    expect(presentationMode({ width: 616, height: 456 }, 'pop-out')).toBe('in-glass');
  });

  it('matches the framing table: desktops read in the glass, phones pop out', () => {
    for (const picture of [
      { width: 1049, height: 824 },
      { width: 874, height: 687 },
      { width: 746, height: 586 },
      { width: 700, height: 550 },
      { width: 632, height: 497 },
      { width: 675, height: 530 },
    ]) {
      expect(presentationMode(picture, null)).toBe('in-glass');
    }
    for (const picture of [
      { width: 379, height: 298 },
      { width: 321, height: 252 },
      { width: 309, height: 242 },
    ]) {
      expect(presentationMode(picture, null)).toBe('pop-out');
    }
  });
});

describe('defaultZoom', () => {
  it('opens at Fit Width while the body stays 12 px or larger', () => {
    const zoomFor = (pictureWidth: number) => defaultZoom(paneClientWidth(pictureWidth, SCROLLBAR), 'in-glass');
    expect(zoomFor(1049)).toEqual({ kind: 'fit-width' });
    expect(bodyPx(1049)).toBeCloseTo(17.4, 1);
    expect(zoomFor(874)).toEqual({ kind: 'fit-width' });
    expect(bodyPx(874)).toBeCloseTo(14.3, 1);
    expect(zoomFor(746)).toEqual({ kind: 'fit-width' });
    expect(bodyPx(746)).toBeGreaterThanOrEqual(12);
  });

  it('reflows at 16 px when Fit Width would be smaller than 12 px', () => {
    expect(defaultZoom(paneClientWidth(700, SCROLLBAR), 'in-glass')).toEqual({ kind: 'reflow' });
    expect(defaultZoom(paneClientWidth(632, SCROLLBAR), 'in-glass')).toEqual({ kind: 'reflow' });
  });

  it('always reflows in the pop-out', () => {
    expect(defaultZoom(2000, 'pop-out')).toEqual({ kind: 'reflow' });
  });
});
