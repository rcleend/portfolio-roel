import { describe, expect, it } from 'vitest';
import { buildGrid, GROUND_Y } from './buildGrid';
import { LevelLayoutError, parseLayout } from './layout';

const EMPTY = '..........';

/** One ten-row section: `rows` replaces rows 3.. from the top; the last row is the ground. */
function section(rows: Partial<Record<number, string>>, ground = '=========='): string {
  const lines = Array.from({ length: 9 }, (_, i) => rows[i + 3] ?? EMPTY);
  return [...lines, ground].join('\n');
}

const minimal = section({ 11: 'P..c.>.E.G' });

describe('parseLayout', () => {
  it('reads markers, platforms and pits by column and row', () => {
    const layout = parseLayout([
      section({ 8: '...?......', 9: '..---.....', 10: '..|.|.....', 11: 'P..c.>.E.G' }, '====__===='),
    ]);
    expect(layout.columns).toBe(10);
    expect(layout.start).toEqual({ col: 0, row: 11 });
    expect(layout.customers).toEqual([{ col: 3, row: 11 }]);
    expect(layout.blocks).toEqual([{ col: 3, row: 8 }]);
    expect(layout.platforms).toEqual([{ row: 9, from: 2, to: 4 }]);
    expect(layout.supports).toEqual([
      { col: 2, row: 10 },
      { col: 4, row: 10 },
    ]);
    expect(layout.ground).toEqual([true, true, true, true, false, false, true, true, true, true]);
    expect([layout.arenaCol, layout.boss.col, layout.goal.col]).toEqual([5, 7, 9]);
  });

  it('joins sections side by side', () => {
    const layout = parseLayout([section({ 11: 'P.........' }), section({ 11: 'c....>.E.G' })]);
    expect(layout.columns).toBe(20);
    expect(layout.customers).toEqual([{ col: 10, row: 11 }]);
  });

  it('reads moving platform tracks and slow zones as runs', () => {
    const layout = parseLayout([section({ 10: '.vvv......', 11: 'Pm~~~>.E.G' })]);
    expect(layout.movers).toEqual([{ row: 11, from: 1, to: 4 }]);
    expect(layout.slowZones).toEqual([{ row: 10, from: 1, to: 3 }]);
  });

  it('builds a collision grid with the ground on row 12 at y 200', () => {
    const layout = parseLayout([section({ 8: '...?......', 9: '..---.....', 11: 'P..c.>.E.G' }, '====__====')]);
    const grid = buildGrid(layout);
    expect(grid.rowTop(12)).toBe(GROUND_Y);
    expect(grid.kindAt(0, 12)).toBe('solid');
    expect(grid.kindAt(4, 12)).toBe('empty');
    expect(grid.kindAt(2, 9)).toBe('oneWay');
    expect(grid.kindAt(3, 8)).toBe('solid');
  });

  it.each([
    ['an unknown character', [section({ 11: 'P..x.>.E.G' })], /unknown character "x" at column 3, row 11/],
    ['a ragged row', [section({ 5: '...', 11: 'P..c.>.E.G' })], /section 1 row 5 is 3 wide/],
    ['too few rows', ['P..c\n===='], /section 1 has 2 rows, expected 10/],
    ['ground above the ground row', [section({ 6: '==........', 11: 'P..c.>.E.G' })], /belongs on the ground row/],
    ['a stray track', [section({ 11: 'P.~..>.E.G' })], /"~" track must follow "m"/],
    ['two starts', [section({ 11: 'P.Pc.>.E.G' })], /"P" may appear only once/],
    ['a missing goal', [section({ 11: 'P..c.>.E..' })], /missing goal/],
  ])('rejects %s', (_name, sections, message) => {
    expect(() => parseLayout(sections)).toThrow(LevelLayoutError);
    expect(() => parseLayout(sections)).toThrow(message);
  });

  it('accepts the minimal layout', () => {
    expect(() => parseLayout([minimal])).not.toThrow();
  });
});
