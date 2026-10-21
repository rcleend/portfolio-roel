import { describe, expect, it } from 'vitest';
import { alignedX, wrapText } from './textLayout';

// A monospace measure keeps expectations readable: every character is 6 px.
const mono = (s: string): number => s.length * 6;

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('PRESS START', 100, mono)).toEqual(['PRESS START']);
  });

  it('wraps greedily at word boundaries', () => {
    expect(wrapText('the quick brown fox jumps', 60, mono)).toEqual(['the quick', 'brown fox', 'jumps']);
  });

  it('honours explicit newlines and keeps blank lines', () => {
    expect(wrapText('one\n\ntwo', 100, mono)).toEqual(['one', '', 'two']);
  });

  it('collapses repeated spaces', () => {
    expect(wrapText('a    b', 100, mono)).toEqual(['a b']);
  });

  it('splits a word that cannot fit on any line', () => {
    expect(wrapText('ab supercalifragilistic', 36, mono)).toEqual(['ab', 'superc', 'alifra', 'gilist', 'ic']);
  });

  it('fits a line exactly at maxWidth', () => {
    expect(wrapText('abc def', 42, mono)).toEqual(['abc def']);
    expect(wrapText('abc def', 41, mono)).toEqual(['abc', 'def']);
  });

  it('works with proportional measures', () => {
    const widths: Record<string, number> = { i: 2, m: 6, ' ': 4 };
    const measure = (s: string): number => [...s].reduce((sum, c) => sum + (widths[c] ?? 5), 0);
    expect(wrapText('iii mmm', 12, measure)).toEqual(['iii', 'mm', 'm']);
  });
});

describe('alignedX', () => {
  it('aligns on whole pixels', () => {
    expect(alignedX(160, 51, 'center')).toBe(135);
    expect(alignedX(160, 50, 'right')).toBe(110);
    expect(alignedX(160, 50, 'left')).toBe(160);
  });
});
