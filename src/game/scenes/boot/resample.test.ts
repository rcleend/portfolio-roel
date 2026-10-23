import { describe, expect, it } from 'vitest';
import { Mask } from '../../art/logos/raster/Mask';
import { resampleSpans, type Span } from './resample';

function render(spans: readonly Span[], width: number, height: number): string[] {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
  for (const span of spans) {
    for (let x = span.x; x < span.x + span.w; x++) {
      const row = rows[span.y];
      if (row) row[x] = '#';
    }
  }
  return rows.map((row) => row.join(''));
}

describe('resampleSpans', () => {
  const mask = Mask.fromRows(['##..', '#...', '####']);

  it('reproduces the mask at its own size as horizontal runs', () => {
    expect(render(resampleSpans(mask, 4, 3, false), 4, 3)).toEqual(mask.toRows());
    expect(resampleSpans(mask, 4, 3, false)).toContainEqual({ x: 0, y: 2, w: 4 });
  });

  it('mirrors left to right', () => {
    expect(render(resampleSpans(mask, 4, 3, true), 4, 3)).toEqual(['..##', '...#', '####']);
  });

  it('picks whole source columns and rows when squeezed, never blending', () => {
    expect(render(resampleSpans(mask, 2, 3, false), 2, 3)).toEqual(['#.', '..', '##']);
    expect(render(resampleSpans(mask, 4, 1, false), 4, 1)).toEqual(['#...']);
  });

  it('repeats columns when stretched', () => {
    expect(render(resampleSpans(Mask.fromRows(['#.']), 4, 1, false), 4, 1)).toEqual(['##..']);
  });
});
