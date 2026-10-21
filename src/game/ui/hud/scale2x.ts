/**
 * Scale2x (EPX) on a 1-bit glyph: doubles the size, but rounds diagonal
 * steps instead of turning every pixel into a blocky 2 × 2 square. The
 * result is still crisp one-pixel art, just bigger — which is how the
 * level's banner face is derived from the arcade face.
 *
 * Rows use `#` for ink and `.` for empty, like `parseGlyphSheet`.
 */
export function scale2x(rows: readonly string[]): string[] {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const ink = (x: number, y: number): boolean => rows[y]?.[x] === '#';
  const out: string[][] = Array.from({ length: height * 2 }, () => Array.from({ length: width * 2 }, () => '.'));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = ink(x, y);
      const a = ink(x, y - 1);
      const b = ink(x + 1, y);
      const c = ink(x - 1, y);
      const d = ink(x, y + 1);
      const cells: readonly [number, number, boolean][] = [
        [0, 0, c === a && c !== d && a !== b ? a : p],
        [1, 0, a === b && a !== c && b !== d ? b : p],
        [0, 1, d === c && d !== b && c !== a ? c : p],
        [1, 1, b === d && b !== a && d !== c ? d : p],
      ];
      for (const [dx, dy, on] of cells) {
        const row = out[y * 2 + dy];
        if (row && on) row[x * 2 + dx] = '#';
      }
    }
  }
  return out.map((row) => row.join(''));
}
