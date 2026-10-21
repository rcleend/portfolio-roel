/** Segments in the loading bar. Twenty reads as a chunky arcade meter at native size. */
export const BAR_SEGMENTS = 20;

/** How many whole segments `progress` (0–1) lights; the last lights only when loading is truly done. */
export function litSegments(progress: number, segments = BAR_SEGMENTS): number {
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  if (progress >= 1) return segments;
  return Math.min(segments - 1, Math.floor(progress * segments));
}

/** "007%"-style zero-padded percentage, floored so 100% means done. */
export function percentLabel(progress: number): string {
  const percent = Number.isFinite(progress) ? Math.floor(Math.min(1, Math.max(0, progress)) * 100) : 0;
  return `${String(percent).padStart(3, '0')}%`;
}
