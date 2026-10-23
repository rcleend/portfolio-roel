import { describe, expect, it } from 'vitest';
import { paintCard } from './card';

function rowBrightness(bitmap: ReturnType<typeof paintCard>, y: number): number {
  let total = 0;
  for (let x = 0; x < bitmap.width; x++) {
    const pixel = bitmap.get(x, y);
    total += pixel ? pixel.r + pixel.g + pixel.b : 0;
  }
  return total / bitmap.width;
}

describe('khaki card', () => {
  const bitmap = paintCard(320, 240);

  it('runs from dark umber at the top to pale khaki at the bottom', () => {
    expect(rowBrightness(bitmap, 0)).toBeLessThan(rowBrightness(bitmap, 120));
    expect(rowBrightness(bitmap, 120)).toBeLessThan(rowBrightness(bitmap, 239));
  });

  it('is opaque everywhere and streaked along rows', () => {
    expect(bitmap.isOpaque(0, 0) && bitmap.isOpaque(319, 239)).toBe(true);
    const row = Array.from({ length: 320 }, (_, x) => JSON.stringify(bitmap.get(x, 100)));
    expect(new Set(row).size).toBeGreaterThan(1);
  });

  it('is identical every time it is painted', () => {
    expect(paintCard(32, 24).data).toEqual(paintCard(32, 24).data);
  });
});
