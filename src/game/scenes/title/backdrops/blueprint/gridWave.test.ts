import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/engine/math/Rect';
import { lightGrid } from './gridWave';
import type { PenCanvas } from './pen';
import { insideFrame, isMajorColumn, isMajorRow, TITLE_BLOCK } from './sheet';

function pixelCanvas(): PenCanvas & { readonly pixels: Map<string, string> } {
  const pixels = new Map<string, string>();
  const canvas = {
    pixels,
    fillStyle: '' as PenCanvas['fillStyle'],
    fillRect(x: number, y: number, w: number, h: number): void {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pixels.set(`${i},${j}`, String(canvas.fillStyle));
    },
  };
  return canvas;
}

describe('grid wave', () => {
  const [cx, cy] = [155, 80];

  it('relights only the printed grid, inside the frame and within the ring', () => {
    const canvas = pixelCanvas();
    lightGrid(canvas, cx, cy, 54, 60, 'minor', 'major');
    expect(canvas.pixels.size).toBeGreaterThan(40);
    for (const [key, color] of canvas.pixels) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(insideFrame(x, y)).toBe(true);
      expect(x % 8 === 0 || y % 8 === 0).toBe(true);
      const distance = Math.hypot(x - cx, y - cy);
      expect(distance).toBeGreaterThan(54 - 1.5);
      expect(distance).toBeLessThan(60 + 1.5);
      const major = (x % 8 === 0 && isMajorColumn(x)) || (y % 8 === 0 && isMajorRow(y));
      if (!major) expect(color).toBe('minor');
    }
  });

  it('crosses every grid line the ring reaches, on both sides of the centre', () => {
    const canvas = pixelCanvas();
    lightGrid(canvas, cx, cy, 30, 36, 'minor', 'major');
    const columns = Array.from({ length: 8 }, (_, i) => Math.ceil((cx - 29) / 8) * 8 + i * 8).filter(
      (x) => x - cx < 30,
    );
    expect(columns.length).toBeGreaterThan(5);
    for (const x of columns) {
      const column = [...canvas.pixels.keys()]
        .filter((key) => key.startsWith(`${x},`))
        .map((key) => Number(key.split(',')[1]));
      expect(column.some((y) => y < cy)).toBe(true);
      expect(column.some((y) => y > cy)).toBe(true);
    }
  });

  it('leaves the title block alone, where the sheet prints no grid', () => {
    const canvas = pixelCanvas();
    const { box } = TITLE_BLOCK;
    lightGrid(canvas, box.x + 10, box.y, 0, 40, 'minor', 'major');
    expect(canvas.pixels.size).toBeGreaterThan(0);
    for (const key of canvas.pixels.keys()) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(containsPoint(box, x, y), key).toBe(false);
    }
  });

  it('lights nothing before the ring has any size', () => {
    const canvas = pixelCanvas();
    lightGrid(canvas, cx, cy, -6, 0, 'minor', 'major');
    expect(canvas.pixels.size).toBe(0);
  });
});
