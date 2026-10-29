import type { CSSProperties } from 'react';
import type { Box } from './tvStills';
import { useStillPlacement } from './useStillPlacement';
import './TvStill.css';

/** The still's element: the room host lays the game's picture into it, so the two fade out as one. */
export const TV_STILL_ID = 'tv-still';

export interface TvStillProps {
  /** Up; false fades it out (at once under reduced motion), as the live room takes over. */
  readonly shown: boolean;
  readonly failed: boolean;
}

/**
 * The first thing a visitor sees (docs/ROOM.md › Startup): the room's own TV view with the tube dark, a picture
 * rendered by the room, placed exactly where the 3D scene will put it, so the game can turn on and start on it while
 * the room downloads behind, and the hand-over to the live scene moves nothing. The room host lays the game's
 * picture over it (StillPicture.tsx).
 */
export function TvStill({ shown, failed }: TvStillProps) {
  const { still, image } = useStillPlacement();
  return (
    <div id={TV_STILL_ID} className="tv-still" data-shown={shown} data-framing={still.framing} aria-hidden={!failed}>
      <img className="tv-still__image" src={`${import.meta.env.BASE_URL}${still.url}`} alt="" style={box(image)} />
      {failed ? (
        <p className="tv-still__failed" role="alert">
          The room would not load. <a href="#resume">Read the résumé instead</a>.
        </p>
      ) : null}
    </div>
  );
}

/** Inline position and size of a box in CSS px. */
export function box({ left, top, width, height }: Box): CSSProperties {
  return { left, top, width, height };
}
