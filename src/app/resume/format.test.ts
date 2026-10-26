import { describe, expect, it } from 'vitest';
import { formatMonth, sentenceCase } from './format';

describe('formatMonth', () => {
  it('formats ISO year-months in UTC', () => {
    expect(formatMonth('2024-10')).toBe('Oct 2024');
    expect(formatMonth('2018-01')).toBe('Jan 2018');
  });
});

describe('sentenceCase', () => {
  it('turns arcade capitals into a sentence', () => {
    expect(sentenceCase('YOUR TEAM?')).toBe('Your team?');
    expect(sentenceCase('')).toBe('');
  });
});
