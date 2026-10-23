import { useEffect, useEffectEvent, useState } from 'react';
import { formatClock, msToNextMinute } from './clock';

/**
 * The taskbar clock's text, updated on each minute boundary with a timeout
 * re-armed per minute (never an interval). `onTick` runs on every change, so
 * the monitor's still can show the same minute next time it is painted.
 */
export function useClock(onTick: () => void): string {
  const [text, setText] = useState(() => formatClock(new Date()));
  const tick = useEffectEvent(onTick);
  useEffect(() => {
    let timer = 0;
    const arm = (): void => {
      timer = window.setTimeout(() => {
        setText(formatClock(new Date()));
        tick();
        arm();
      }, msToNextMinute(Date.now()));
    };
    arm();
    return () => window.clearTimeout(timer);
  }, []);
  return text;
}
