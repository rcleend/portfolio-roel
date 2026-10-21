/**
 * The level layout DSL.
 *
 * A level is written as a list of sections, each a block of ten text rows
 * that are laid side by side, so a stage reads like a strip of comic panels:
 *
 *     `
 *     ....................   row 3   (y  56)
 *     ....................   row 4
 *     ....................   row 5
 *     ......??............   row 6
 *     ....................   row 7
 *     ..........-----.....   row 8   (y 136) one-way platform
 *     ..........|...|.....   row 9   platform supports (decoration)
 *     ..........|...|.....   row 10
 *     ..P.......|.c.|.....   row 11  (y 184) the row bodies stand in
 *     =========____=======   row 12  (y 200) ground or pit
 *     `
 *
 * One character is one 16 px tile. Rows 13 and 14 (the rest of the ground)
 * are implied by row 12. See `LEGEND` for every character.
 */

/** First grid row the DSL describes; rows above it are always empty. */
export const LAYOUT_TOP_ROW = 3;
/** Grid row of the ground's top edge (y = 200 with an 8 px grid origin). */
export const GROUND_ROW = 12;
/** Grid rows in a level: ground top, fill and the half-visible base. */
export const GRID_ROWS = 15;
const LINES_PER_SECTION = GROUND_ROW - LAYOUT_TOP_ROW + 1;

export const LEGEND = {
  '.': 'empty',
  '=': 'ground (ground row only)',
  _: 'pit (ground row only)',
  '-': 'one-way platform',
  '|': 'platform support (decoration)',
  '?': 'career highlight block (solid)',
  P: 'player start',
  c: 'unhappy customer',
  E: 'escalated customer (the boss)',
  '>': 'arena: the camera locks from this column to the end of the level',
  F: 'checkpoint flag',
  G: 'goal moment anchor',
  g: 'gate hazard (rate-limit gate)',
  v: 'slowing zone (scope creep)',
  b: 'barrier with a walkable top (3 tiles wide, marked on its left tile)',
  m: 'moving platform start; its roof runs along this row',
  '~': 'moving platform track, extending the run started by `m`',
} as const;

export type LayoutChar = keyof typeof LEGEND;

export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** A horizontal run of tiles on one row, `from` and `to` inclusive. */
export interface Run {
  readonly row: number;
  readonly from: number;
  readonly to: number;
}

export interface LevelLayout {
  readonly columns: number;
  /** Per column: `true` where the ground is present, `false` over a pit. */
  readonly ground: readonly boolean[];
  readonly platforms: readonly Run[];
  readonly supports: readonly Cell[];
  /** Left to right; highlight ids are assigned in this order. */
  readonly blocks: readonly Cell[];
  readonly start: Cell;
  readonly customers: readonly Cell[];
  readonly boss: Cell;
  readonly arenaCol: number;
  readonly checkpoints: readonly Cell[];
  readonly goal: Cell;
  readonly gates: readonly Cell[];
  readonly slowZones: readonly Run[];
  readonly barriers: readonly Cell[];
  /** The whole span a moving platform's roof sweeps, start marker included. */
  readonly movers: readonly Run[];
}

export class LevelLayoutError extends Error {
  override readonly name = 'LevelLayoutError';
}

/** Parses DSL sections into a layout. Throws a `LevelLayoutError` pointing at the offending section, row and column. */
export function parseLayout(sections: readonly string[]): LevelLayout {
  const rows = joinSections(sections);
  const columns = rows[0]?.length ?? 0;
  const at = (col: number, row: number): string => rows[row - LAYOUT_TOP_ROW]?.[col] ?? '.';
  const fail = (col: number, row: number, message: string): never => {
    throw new LevelLayoutError(`Level layout: ${message} at column ${col}, row ${row}`);
  };

  const ground: boolean[] = [];
  const platforms: Run[] = [];
  const slowZones: Run[] = [];
  const movers: Run[] = [];
  const cells: Record<'supports' | 'blocks' | 'customers' | 'checkpoints' | 'gates' | 'barriers', Cell[]> = {
    supports: [],
    blocks: [],
    customers: [],
    checkpoints: [],
    gates: [],
    barriers: [],
  };
  const singles: Partial<Record<'P' | 'E' | 'G' | '>', Cell>> = {};
  /** Last column of the run of `continues` cells starting at `from` (or `fallback` if there is none). */
  const runEnd = (from: number, continues: (col: number) => boolean, fallback = from): number => {
    let end = fallback;
    for (let col = from; col < columns && continues(col); col++) end = col;
    return end;
  };

  for (let row = LAYOUT_TOP_ROW; row <= GROUND_ROW; row++) {
    for (let col = 0; col < columns; col++) {
      const char = at(col, row);
      if (!(char in LEGEND)) fail(col, row, `unknown character "${char}"`);
      if (row === GROUND_ROW) {
        if (char !== '=' && char !== '_') fail(col, row, `the ground row may only contain "=" or "_", got "${char}"`);
        ground.push(char === '=');
        continue;
      }
      switch (char as LayoutChar) {
        case '=':
        case '_':
          fail(col, row, `"${char}" belongs on the ground row`);
          break;
        case '|':
          cells.supports.push({ col, row });
          break;
        case '?':
          cells.blocks.push({ col, row });
          break;
        case 'c':
          cells.customers.push({ col, row });
          break;
        case 'F':
          cells.checkpoints.push({ col, row });
          break;
        case 'g':
          cells.gates.push({ col, row });
          break;
        case 'b':
          cells.barriers.push({ col, row });
          break;
        case 'P':
        case 'E':
        case 'G':
        case '>': {
          const key = char as 'P' | 'E' | 'G' | '>';
          if (singles[key]) fail(col, row, `"${char}" may appear only once`);
          singles[key] = { col, row };
          break;
        }
        case '-':
          if (at(col - 1, row) !== '-') platforms.push({ row, from: col, to: runEnd(col, (c) => at(c, row) === '-') });
          break;
        case 'v':
          if (at(col - 1, row) !== 'v') slowZones.push({ row, from: col, to: runEnd(col, (c) => at(c, row) === 'v') });
          break;
        case 'm':
          movers.push({ row, from: col, to: runEnd(col + 1, (c) => at(c, row) === '~', col) });
          break;
        case '~':
          if (at(col - 1, row) !== '~' && at(col - 1, row) !== 'm') fail(col, row, 'a "~" track must follow "m"');
          break;
        case '.':
          break;
      }
    }
  }

  const required = (key: 'P' | 'E' | 'G' | '>', what: string): Cell =>
    singles[key] ?? fail(0, LAYOUT_TOP_ROW, `missing ${what} ("${key}")`);
  return {
    columns,
    ground,
    platforms,
    supports: cells.supports,
    blocks: cells.blocks,
    start: required('P', 'player start'),
    customers: cells.customers,
    boss: required('E', 'escalated customer'),
    arenaCol: required('>', 'arena marker').col,
    checkpoints: cells.checkpoints,
    goal: required('G', 'goal'),
    gates: cells.gates,
    slowZones,
    barriers: cells.barriers,
    movers,
  };
}

/** Trims each section's indentation and lays the sections side by side. */
function joinSections(sections: readonly string[]): string[] {
  if (sections.length === 0) throw new LevelLayoutError('Level layout: at least one section is required');
  const joined = Array.from({ length: LINES_PER_SECTION }, () => '');
  sections.forEach((section, index) => {
    const lines = section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length !== LINES_PER_SECTION) {
      throw new LevelLayoutError(
        `Level layout: section ${index + 1} has ${lines.length} rows, expected ${LINES_PER_SECTION}`,
      );
    }
    const width = (lines[0] as string).length;
    lines.forEach((line, row) => {
      if (line.length !== width) {
        throw new LevelLayoutError(
          `Level layout: section ${index + 1} row ${row + LAYOUT_TOP_ROW} is ${line.length} wide, expected ${width}`,
        );
      }
      joined[row] += line;
    });
  });
  return joined;
}
