import { describe, expect, it } from 'vitest';
import { fitZoom, gridLayout } from './zoom';

describe('gridLayout', () => {
  it('shows tiles at 2× two by two on a laptop-wide board', () => {
    expect(gridLayout(1464, 4, 'auto')).toEqual({ columns: 2, zoom: 2, tileWidth: 660 });
  });

  it('drops to 1× rather than lose the side-by-side comparison, keeping rows balanced', () => {
    expect(gridLayout(1200, 4, 'auto')).toEqual({ columns: 2, zoom: 1, tileWidth: 340 });
    expect(gridLayout(1200, 2, 'auto')).toEqual({ columns: 2, zoom: 1, tileWidth: 340 });
  });

  it('gives a lone tile the larger zoom', () => {
    expect(gridLayout(700, 1, 'auto')).toEqual({ columns: 1, zoom: 2, tileWidth: 660 });
  });

  it('spreads more tiles over balanced rows on wide screens', () => {
    expect(gridLayout(2400, 5, 'auto')).toEqual({ columns: 3, zoom: 2, tileWidth: 660 });
    expect(gridLayout(2800, 4, 'auto')).toEqual({ columns: 4, zoom: 2, tileWidth: 660 });
  });

  it('honours a chosen zoom, as many columns as fit', () => {
    expect(gridLayout(1464, 4, 1)).toEqual({ columns: 4, zoom: 1, tileWidth: 340 });
    expect(gridLayout(1464, 4, 3)).toEqual({ columns: 1, zoom: 3, tileWidth: 980 });
  });

  it('never goes below one column at 1×', () => {
    expect(gridLayout(200, 3, 'auto')).toEqual({ columns: 1, zoom: 1, tileWidth: 340 });
  });
});

describe('fitZoom', () => {
  it('finds the largest whole zoom that fits, and never less than 1×', () => {
    expect(fitZoom(1400, 1000)).toBe(4);
    expect(fitZoom(1400, 700)).toBe(2);
    expect(fitZoom(300, 200)).toBe(1);
  });
});
