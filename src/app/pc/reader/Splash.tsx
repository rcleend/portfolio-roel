import type { Ref } from 'react';
import { ArtSvg } from '../desktop/ArtSvg';
import type { Rect } from '../desktop/desktopLayout';
import { SPLASH_STATUS_TEXT, type SplashStatus } from '../session/storyboard';
import { SHEET_MARK } from './marks';
import './Splash.css';

export const SPLASH_WIDTH = 360;
export const SPLASH_HEIGHT = 220;

/** The splash's box: centred over the desktop above the taskbar. */
export function splashRect(desktopWidth: number, taskbarTop: number): Rect {
  return {
    x: (desktopWidth - SPLASH_WIDTH) / 2,
    y: (taskbarTop - SPLASH_HEIGHT) / 2,
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
  };
}

/** The reader's start-up splash, shown on the first open in a page load (and while a skip waits). */
export function Splash({
  rect,
  status,
  ref,
}: {
  readonly rect: Rect;
  readonly status: SplashStatus;
  readonly ref: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className="pc-splash" style={{ left: rect.x, top: rect.y }} aria-hidden="true">
      <ArtSvg className="pc-splash__mark" art={SHEET_MARK} size={64} />
      <p className="pc-splash__name">
        Document Reader <span>7.0</span>
      </p>
      <p className="pc-splash__status">{SPLASH_STATUS_TEXT[status]}</p>
      <p className="pc-splash__credit">A lookalike by Roel Leenders</p>
    </div>
  );
}
