import { useEffect, useState } from 'react';
import type { PcDisplay } from '../display';
import { formatClock, msToNextMinute } from './clock';

/**
 * The taskbar clock's text. A timeout re-armed at each minute boundary (never an interval) tells
 * the monitor its still is out of date, so the next still shows the new minute. The text itself,
 * and with it a render of the screen, changes only while the screen is live: hidden, it would be
 * work for nobody all the while the visitor plays the game. It catches up as the screen goes live,
 * in the same render as the landing.
 */
export function useClock(display: PcDisplay): string {
  const [text, setText] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const show = (): void => setText(formatClock(new Date()));
    const stop = display.onLiveChange((live) => {
      if (live) show();
    });
    let timer = 0;
    const arm = (): void => {
      timer = window.setTimeout(() => {
        display.invalidateStill();
        if (display.live) show();
        arm();
      }, msToNextMinute(Date.now()));
    };
    arm();
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [display]);
  return text;
}
