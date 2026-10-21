/**
 * Turns pixel-art rows ('#' = filled, anything else = empty) into one SVG
 * path of unit squares, merging horizontal runs. Drawn with
 * `shape-rendering="crispEdges"` this scales to any whole zoom without blur,
 * so DOM chrome (sound toggle, touch pad) shares the game's pixel grid.
 */
export function pixelPath(rows: readonly string[], ink = '#'): string {
  const parts: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== ink) {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === ink) x++;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join('');
}

/** Rows of a filled pixel disc of `radius`, as drawn by the midpoint algorithm (matches `Gfx.circle`). */
export function discRows(radius: number): string[] {
  const size = radius * 2 + 1;
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    const dy = y - radius;
    // +0.5 rounds the edge like the midpoint circle, avoiding single-pixel nubs at the poles.
    const half = Math.floor(Math.sqrt(Math.max(0, (radius + 0.5) ** 2 - dy * dy)));
    rows.push(' '.repeat(radius - half) + '#'.repeat(half * 2 + 1) + ' '.repeat(radius - half));
  }
  return rows;
}
