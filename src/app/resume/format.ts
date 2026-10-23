const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2024-10" → "Oct 2024". */
export function formatMonth(isoYearMonth: string): string {
  return MONTH.format(new Date(`${isoYearMonth}-01T00:00:00Z`));
}

/** "YOUR TEAM?" → "Your team?": arcade copy is shouted, the résumé is not. */
export function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
