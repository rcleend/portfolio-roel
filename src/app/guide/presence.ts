import { useEffect, useState } from 'react';

/** Mounted and arriving, mounted and leaving, or gone. */
export type Presence = 'in' | 'out' | null;

/**
 * Keeps a piece of UI mounted for `exitMs` after `shown` turns false, so it can animate out (`'out'`) before it goes.
 * Showing it again mid-exit brings it straight back in.
 */
export function usePresence(shown: boolean, exitMs: number): Presence {
  const [presence, setPresence] = useState<Presence>(shown ? 'in' : null);
  if (shown && presence !== 'in') setPresence('in');
  if (!shown && presence === 'in') setPresence('out');
  useEffect(() => {
    if (presence !== 'out') return;
    const timer = window.setTimeout(() => setPresence(null), exitMs);
    return () => window.clearTimeout(timer);
  }, [presence, exitMs]);
  return presence;
}
