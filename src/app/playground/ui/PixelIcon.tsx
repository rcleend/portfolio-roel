/** Icons drawn the way the game's sprites are: one character per pixel, `#` ink and `.` empty. */
const ICONS = {
  tv: ['..#...#..', '...#.#...', '#########', '#.......#', '#.#.....#', '#.......#', '#########', '.#.....#.'],
  play: ['#.....', '###...', '#####.', '######', '#####.', '###...', '#.....'],
  pause: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##'],
  replay: ['#..#..#', '#.##.##', '#######', '#.##.##', '#..#..#'],
  stepBack: ['#....#', '#...##', '#..###', '#.####', '#..###', '#...##', '#....#'],
  stepForward: ['#....#', '##...#', '###..#', '####.#', '###..#', '##...#', '#....#'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type PixelIconName = keyof typeof ICONS;

/** Every ink pixel of `rows` as one SVG path of unit squares. */
function pathOf(rows: readonly string[]): string {
  return rows.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
}

/** A small pixel-art icon at a whole-number scale, in the current text colour. */
export function PixelIcon({ name, scale = 2 }: { readonly name: PixelIconName; readonly scale?: number }) {
  const rows = ICONS[name];
  const width = rows[0]?.length ?? 0;
  return (
    <svg
      className="pixel-icon"
      viewBox={`0 0 ${width} ${rows.length}`}
      width={width * scale}
      height={rows.length * scale}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d={pathOf(rows)} fill="currentColor" />
    </svg>
  );
}
