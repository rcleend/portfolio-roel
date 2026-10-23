import { describe, expect, it } from 'vitest';
import { getExperience } from '@/content';
import { describeMetric, formatMetric, highlightRows } from './career';

describe('highlightRows', () => {
  const scripe = getExperience('scripe');

  it('lists every highlight in résumé order', () => {
    expect(highlightRows(scripe, [], []).map((row) => row.highlight.id)).toEqual(
      scripe.highlights.map((highlight) => highlight.id),
    );
  });

  it('unlocks what was ever collected and marks only this run as fresh', () => {
    const rows = highlightRows(scripe, ['scripe-teams', 'scripe-ios'], ['scripe-ios', 'scripe-onboarding']);
    expect(rows.map(({ unlocked, fresh }) => [unlocked, fresh])).toEqual([
      [true, false],
      [true, true],
      [false, false],
      [true, true],
    ]);
  });
});

describe('metrics', () => {
  it('shows a before → after change, or the outcome alone', () => {
    expect(formatMetric({ label: 'week-one activation', from: '9%', to: '22%' })).toBe('9% → 22%');
    expect(formatMetric({ label: '90-day retention', to: '+25%' })).toBe('+25%');
  });

  it('prefixes the shouty label in the detail window', () => {
    expect(describeMetric({ label: 'week-one activation', from: '9%', to: '22%' })).toBe(
      'WEEK-ONE ACTIVATION 9% → 22%',
    );
  });
});
