import { pixelPath } from '../../pixel/pixelPath';

/**
 * The transport's glyphs as pixel art on the sound toggle's grid, so the bar sits with
 * the rest of the site's chrome. Original drawings of the usual transport symbols.
 */
const ROWS = {
  previous: ['#....#...#', '#...##..##', '#..###.###', '#.########', '#..###.###', '#...##..##', '#....#...#'],
  play: ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'],
  pause: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##'],
  stop: ['######', '######', '######', '######', '######', '######'],
  next: ['#...#....#', '##..##...#', '###.###..#', '########.#', '###.###..#', '##..##...#', '#...#....#'],
  back: ['....##', '..####', '######', '..####', '....##'],
} as const;

export type Glyph = keyof typeof ROWS;

const PATHS = Object.fromEntries(Object.entries(ROWS).map(([name, rows]) => [name, pixelPath(rows)])) as Record<
  Glyph,
  string
>;

export function GlyphIcon({ glyph, scale = 2 }: { readonly glyph: Glyph; readonly scale?: number }) {
  const rows = ROWS[glyph];
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[glyph]} transform="translate(0.5 0.5)" className="radio-glyph__shadow" />
      <path d={PATHS[glyph]} className="radio-glyph" />
    </svg>
  );
}
