import { type CSSProperties, type PointerEvent, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GameSurface } from '@/engine/core/GameSurface';
import { pointerKind } from '../cursors/gameCursor';
import { TV_STILL_ID } from '../startup/TvStill';
import { REDUCED_MOTION, useMediaQuery } from '../useMediaQuery';
import { toNativePixels } from './integerScale';
import './StillPicture.css';

export interface StillPictureProps {
  readonly surface: GameSurface;
  /** Turns the picture on; `onLit` once it is up. */
  readonly powered: boolean;
  readonly onLit: () => void;
  /** The pointer goes to the room's stage underneath (once it is in, the room maps it onto its own picture). */
  readonly passThrough: boolean;
}

/**
 * The game on the startup still (docs/ROOM.md › Startup): the game's canvas laid flat where the room will show its
 * picture, under scanlines like the tube's, so boot and title play while the room downloads behind. It lives in the
 * still's own element, so the two fade out as one picture. It turns on with a quick bloom (at once under reduced
 * motion), and takes the pointer until the room is in to take it itself.
 */
export function StillPicture({ surface, powered, onLit, passThrough }: StillPictureProps) {
  const screen = useRef<HTMLDivElement>(null);
  const reduced = useMediaQuery(REDUCED_MOTION);
  const lit = useEffectEvent(onLit);

  useLayoutEffect(() => {
    const host = screen.current;
    if (!host) return;
    const { canvas } = surface;
    canvas.className = 'still-picture__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    return () => canvas.remove();
  }, [surface]);

  // Under reduced motion there is no bloom to wait for.
  useEffect(() => {
    if (powered && reduced) lit();
  }, [powered, reduced]);

  const sendPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = surface.canvas.getBoundingClientRect();
    const { x, y } = toNativePixels(event.clientX, event.clientY, rect, surface.width, surface.height);
    surface.pointer.move(x, y, pointerKind(event.pointerType));
  };

  const still = document.getElementById(TV_STILL_ID);
  if (!still) return null;
  return createPortal(
    <div
      ref={screen}
      className="still-picture"
      data-powered={powered}
      data-pass-through={passThrough}
      aria-hidden="true"
      style={{ '--rows': surface.height } as CSSProperties}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && powered) lit();
      }}
      onPointerMove={sendPointer}
      onPointerDown={(event) => {
        sendPointer(event);
        surface.pointer.down(pointerKind(event.pointerType));
      }}
      onPointerUp={(event) => {
        sendPointer(event);
        surface.pointer.up();
      }}
      onPointerLeave={() => surface.pointer.leave()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="still-picture__scanlines" />
    </div>,
    still,
  );
}
