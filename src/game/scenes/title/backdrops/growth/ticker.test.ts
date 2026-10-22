import { describe, expect, it } from 'vitest';
import { experience } from '@/content';
import { TAPE_LENGTH } from './idle';
import { quoteWidth, tapeLayout, tapeQuotes } from './ticker';
import { terminalType } from './type';

describe('the ticker tape', () => {
  const quotes = tapeQuotes();
  const metrics = experience.flatMap((entry) => entry.highlights).flatMap((highlight) => highlight.metric ?? []);

  it('quotes only what the CV says: every figure is a metric from the content, word for word', () => {
    const figures = quotes.flatMap((quote) => quote.figure ?? []);
    expect(figures.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      if (quote.figure === undefined) continue;
      const source = metrics.find((metric) => metric.label.toUpperCase() === quote.label);
      expect(source, quote.label).toBeDefined();
      expect(quote.figure).toBe(source?.from === undefined ? source?.to : `${source.from}→${source.to}`);
    }
  });

  it('never invents a number: moods carry no figures', () => {
    for (const quote of quotes.filter((entry) => entry.figure === undefined)) {
      expect(quote.label).not.toMatch(/\d/);
    }
  });

  it('can be printed in full with the terminal type', () => {
    const font = terminalType();
    for (const quote of quotes) {
      for (const char of `${quote.label}${quote.figure ?? ''}▲▼`) expect(font.has(char), char).toBe(true);
    }
  });

  it('fits its quotes, evenly spaced, on one loop of tape', () => {
    const font = terminalType();
    const widths = quotes.map((quote) => quoteWidth(font, quote));
    const starts = tapeLayout(widths, TAPE_LENGTH);
    expect(starts[0]).toBe(0);
    const gaps = starts.map((start, i) => (starts[i + 1] ?? TAPE_LENGTH) - start - (widths[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it('refuses quotes that would not fit, rather than overlapping them', () => {
    expect(() => tapeLayout([400, 400], TAPE_LENGTH)).toThrow(/px of tape/);
  });
});
