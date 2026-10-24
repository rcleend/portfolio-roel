import { describe, expect, it } from 'vitest';
import { blinks, clock, GLYPHS, lcdFrame, SEGMENT, sameFrame } from './lcdSegments';

const { a, b, c, d, e, f, g } = SEGMENT;

describe('the LCD', () => {
  it('draws the ten digits and the dash in seven segments', () => {
    expect(GLYPHS['8']).toBe(a | b | c | d | e | f | g);
    expect(GLYPHS['1']).toBe(b | c);
    expect(GLYPHS['0']).toBe(a | b | c | d | e | f);
    expect(GLYPHS['-']).toBe(g);
    for (const digit of '0123456789') expect(GLYPHS[digit]).toBeGreaterThan(0);
  });

  it('spells its words in segments', () => {
    expect(lcdFrame({ kind: 'no-disc' })).toEqual({
      icon: null,
      cells: [GLYPHS.n, GLYPHS.o, GLYPHS.d, GLYPHS.I, GLYPHS.S, GLYPHS.C],
      colon: false,
    });
    expect(lcdFrame({ kind: 'reading' })).toEqual({ icon: null, cells: Array(6).fill(g), colon: true });
    expect(lcdFrame({ kind: 'error' }).cells).toEqual([GLYPHS['0'], GLYPHS['0'], g, g, g, g]);
    expect(lcdFrame({ kind: 'error' }).colon).toBe(false);
    expect(lcdFrame({ kind: 'off' }).cells.every((cell) => cell === 0)).toBe(true);
  });

  it('shows the track and its time, or the totals of the disc when stopped', () => {
    const playing = lcdFrame({ kind: 'track', track: 1, seconds: 37, transport: 'playing' });
    expect(playing.icon).toBe('play');
    expect(playing.cells).toEqual([GLYPHS['0'], GLYPHS['1'], GLYPHS['0'], GLYPHS['0'], GLYPHS['3'], GLYPHS['7']]);
    const total = lcdFrame({ kind: 'total', tracks: 2, seconds: 271 });
    expect(total.icon).toBeNull();
    expect(total.cells).toEqual([GLYPHS['0'], GLYPHS['2'], GLYPHS['0'], GLYPHS['4'], GLYPHS['3'], GLYPHS['1']]);
  });

  it('caps the minutes at 99', () => {
    expect(clock(59)).toEqual(['00', '59']);
    expect(clock(99 * 60 + 59)).toEqual(['99', '59']);
    expect(clock(100 * 60 + 5)).toEqual(['99', '59']);
  });

  it('blinks a paused time and nothing else', () => {
    const paused = { kind: 'track', track: 3, seconds: 5, transport: 'paused' } as const;
    expect(blinks(paused)).toBe(true);
    expect(blinks({ ...paused, transport: 'playing' })).toBe(false);
    const on = lcdFrame(paused, true);
    const off = lcdFrame(paused, false);
    expect(on.icon).toBe('pause');
    expect(off.cells.slice(0, 2)).toEqual(on.cells.slice(0, 2));
    expect(off.cells.slice(2)).toEqual([0, 0, 0, 0]);
    expect(off.colon).toBe(false);
    expect(sameFrame(on, off)).toBe(false);
    expect(sameFrame(on, lcdFrame(paused, true))).toBe(true);
  });
});
