import { useEffect, useState } from 'react';
import { ClickOutsideIcon } from './icons';

/** The camera lands first; a beat later the hint. */
const LANDED_HINT_DELAY_MS = 1200;

/**
 * At the computer, for mouse users until they have done it once: how to get up again. A pill under the monitor in the
 * click-outside hint's style; the stage tells keyboard and screen-reader users about Escape instead, so this is
 * decoration only, and it never takes a click.
 */
export function LeaveHint({ due }: { readonly due: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!due) return;
    const timer = window.setTimeout(() => setShown(true), LANDED_HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [due]);
  return (
    <p className="leave-hint guide-pill" aria-hidden="true" data-shown={shown}>
      <ClickOutsideIcon screen="pc" />
      <span className="guide-pill__words">
        <span className="guide-pill__title">Get up</span>
        <span className="guide-pill__body">Click anywhere outside the computer</span>
      </span>
    </p>
  );
}
