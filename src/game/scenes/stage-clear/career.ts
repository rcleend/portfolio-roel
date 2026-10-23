import type { Experience, Highlight, Metric } from '@/content';

/** One line of the career payoff: a highlight and whether the visitor has unlocked it. */
export interface HighlightRow {
  readonly highlight: Highlight;
  /** Collected in this run or an earlier one: shown lit, readable in full. */
  readonly unlocked: boolean;
  /** Collected in this very run: lights up with a fanfare. */
  readonly fresh: boolean;
}

/**
 * Every highlight of the employer, in the résumé's order. Replays accumulate:
 * whatever was found before stays unlocked, so the screen only ever reveals
 * more of the story.
 */
export function highlightRows(
  experience: Experience,
  unlocked: readonly string[],
  collectedThisRun: readonly string[],
): HighlightRow[] {
  const known = new Set(unlocked);
  const fresh = new Set(collectedThisRun);
  return experience.highlights.map((highlight) => ({
    highlight,
    unlocked: known.has(highlight.id) || fresh.has(highlight.id),
    fresh: fresh.has(highlight.id),
  }));
}

/** "9% → 22%", or just "+25%" when there is no starting point. */
export function formatMetric(metric: Metric): string {
  return metric.from ? `${metric.from} → ${metric.to}` : metric.to;
}

/** The metric with its label, for the detail window: "WEEK-ONE ACTIVATION 9% → 22%". */
export function describeMetric(metric: Metric): string {
  return `${metric.label.toUpperCase()} ${formatMetric(metric)}`;
}
