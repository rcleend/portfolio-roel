import { useEffect, useEffectEvent } from 'react';
import './TvStill.css';

/** The still's element in index.html: the room host lays the game's picture into it. */
export const TV_STILL_ID = 'tv-still';

export interface TvStillProps {
  /** Up; false takes it away (see `dropStill`), as the live room takes over or a flat host shows. */
  readonly shown: boolean;
  readonly failed: boolean;
  /** The still is out of sight: its fade is over (at once under reduced motion). */
  readonly onGone: () => void;
}

/**
 * Takes the still away within the frame that calls, ahead of the state that follows (`TvStill`'s `shown`), which a
 * render later would be a frame late. On a `black` picture (docs/ROOM.md › Startup) the flat picture goes at once,
 * since it and the live tube both show nothing, and the drawing eases out around it (TvStill.css); otherwise the
 * still and its picture fade as one (index.html).
 */
export function dropStill(black: boolean): void {
  const still = document.getElementById(TV_STILL_ID);
  if (!still) return;
  if (black) still.dataset.black = '';
  still.dataset.shown = 'false';
}

/**
 * The startup still (docs/ROOM.md › Startup) is static in index.html, the room's own TV view with the tube on a black
 * picture, placed exactly where the 3D scene will put it, so it is the page's first picture and the game can turn on
 * and start on it while the room downloads behind. This says when it goes and when it is gone, and that the room
 * would not load.
 */
export function TvStill({ shown, failed, onGone }: TvStillProps) {
  const gone = useEffectEvent(onGone);
  useEffect(() => {
    const still = document.getElementById(TV_STILL_ID);
    if (!still) return;
    if (shown) {
      delete still.dataset.black;
      delete still.dataset.gone;
    }
    still.dataset.shown = String(shown);
    if (shown) return;
    // Its `visibility` turns with the end of its fade, and at once where nothing fades. `data-gone` tells the still's
    // own script (index.html), which may let go of what it drew.
    const check = (): void => {
      if (getComputedStyle(still).visibility !== 'hidden') return;
      still.dataset.gone = '';
      gone();
    };
    check();
    still.addEventListener('transitionend', check);
    return () => still.removeEventListener('transitionend', check);
  }, [shown]);
  return failed ? (
    <p className="tv-still__failed" role="alert">
      The room would not load. <a href="#resume">Read the résumé instead</a>.
    </p>
  ) : null;
}
