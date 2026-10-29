import { useEffect } from 'react';
import './TvStill.css';

/** The still's element in index.html: the room host lays the game's picture into it, so the two fade out as one. */
export const TV_STILL_ID = 'tv-still';

export interface TvStillProps {
  /** Up; false fades it out (at once under reduced motion), as the live room takes over or a flat host shows. */
  readonly shown: boolean;
  readonly failed: boolean;
}

/**
 * The startup still (docs/ROOM.md › Startup) is static in index.html, the room's own TV view with the tube on a black
 * picture, placed exactly where the 3D scene will put it, so it is the page's first picture and the game can turn on
 * and start on it while the room downloads behind. This says when it goes, and that the room would not load.
 */
export function TvStill({ shown, failed }: TvStillProps) {
  useEffect(() => {
    const still = document.getElementById(TV_STILL_ID);
    if (still) still.dataset.shown = String(shown);
  }, [shown]);
  return failed ? (
    <p className="tv-still__failed" role="alert">
      The room would not load. <a href="#resume">Read the résumé instead</a>.
    </p>
  ) : null;
}
