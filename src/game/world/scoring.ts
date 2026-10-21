/**
 * The score is MRR: every customer won over brings their plan's monthly
 * revenue. Values are deliberately round SaaS price points.
 */
export const MRR = {
  /** A regular customer on a team plan. */
  customer: 99,
  /** The escalated customer closing each level: the enterprise plan. */
  escalated: 2_500,
} as const;

/** "€1,234" — thousands separated, no decimals, never negative. */
export function formatEuros(amount: number): string {
  const whole = Math.max(0, Math.floor(amount));
  return `€${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "+€99" for the pop above a customer who was just won over. */
export function formatMrrGain(amount: number): string {
  return `+${formatEuros(amount)}`;
}
