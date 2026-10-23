const CLOCK_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
/** Made once: building a formatter is the slowest part of repainting the still on a slow phone. */
const visitorClock = new Intl.DateTimeFormat(undefined, CLOCK_FORMAT);

/** The taskbar clock: the visitor's own time, in their locale's short form ("9:41 PM", "21:41"). */
export function formatClock(date: Date, locales?: string | readonly string[]): string {
  return (locales === undefined ? visitorClock : new Intl.DateTimeFormat(locales, CLOCK_FORMAT)).format(date);
}

const MINUTE_MS = 60_000;

/**
 * Milliseconds until the clock's minute next changes. The clock re-arms a
 * timeout to each boundary rather than ticking an interval, so it neither
 * drifts nor wakes up more than once a minute.
 */
export function msToNextMinute(nowMs: number): number {
  return MINUTE_MS - (((nowMs % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);
}
