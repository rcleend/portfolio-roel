import { describe, expect, it } from 'vitest';
import { GROUND_ROW } from '../world/map/layout';
import { lunaLayout } from './luna/map';
import { scripeLayout } from './scripe/map';

describe("the girders' posts", () => {
  for (const [name, layout] of [
    ['luna', lunaLayout],
    ['scripe', scripeLayout],
  ] as const) {
    it(`stand on the ground in ${name}: every post runs unbroken down to the row above it`, () => {
      const rows = new Map<number, number[]>();
      for (const { col, row } of layout.supports) rows.set(col, [...(rows.get(col) ?? []), row]);
      for (const [col, column] of rows) {
        const top = Math.min(...column);
        expect({ col, rows: column.sort((a, b) => a - b), ground: layout.ground[col] }).toEqual({
          col,
          rows: Array.from({ length: GROUND_ROW - top }, (_, index) => top + index),
          ground: true,
        });
      }
    });
  }
});
