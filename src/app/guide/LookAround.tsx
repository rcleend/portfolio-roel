import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SceneSignal } from '../hosts/types';
import { ClickOutsideIcon } from './icons';

export interface LookAroundProps {
  /** Flies to the room view, as a click outside the TV does. */
  readonly onLookAround: () => void;
  readonly scenes: SceneSignal;
  /** The camera rests on the TV. */
  readonly atTv: boolean;
  /** The visitor has left the TV before (on this visit or an earlier one): the hint has retired. */
  readonly learnt: boolean;
  readonly touch: boolean;
  /** Set when the host's way out had the keyboard as this took its place: this button takes the focus (RoomHost.tsx). */
  readonly handOver: RefObject<boolean>;
}

/** Long enough to take the title in, soon enough to be found: the hint's wait from the title's first frame. */
export const LOOK_AROUND_HINT_DELAY_MS = 10_000;

/**
 * The TV view's way out (docs/ART-DIRECTION.md › The room's UI). Always a button, first after the stage in tab order,
 * hidden until it has keyboard focus; ten seconds after the title first shows, a visitor who has never left the TV
 * sees it as the click-outside hint: a pill under the TV (over it on touch screens, where the pad has the bottom)
 * whose pictogram clicks beside a little screen. It goes for good with the first look around, and for this visit
 * once a level starts, so it never sits beside a game in progress.
 */
export function LookAround({ onLookAround, scenes, atTv, learnt, touch, handOver }: LookAroundProps) {
  const due = useTitleSeenFor(scenes, LOOK_AROUND_HINT_DELAY_MS);
  const playing = useSceneReached(scenes, 'level');
  const shown = atTv && due && !learnt && !playing;
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!handOver.current) return;
    handOver.current = false;
    button.current?.focus({ preventScroll: true });
  }, [handOver]);
  return (
    <button
      ref={button}
      type="button"
      className="look-around guide-pill"
      data-shown={shown}
      data-touch={touch}
      aria-label="Look around the room"
      onClick={onLookAround}
    >
      <ClickOutsideIcon screen="tv" />
      <span className="guide-pill__words" aria-hidden="true">
        <span className="guide-pill__title">Look around</span>
        <span className="guide-pill__body">{touch ? 'Tap' : 'Click'} anywhere outside the TV</span>
      </span>
    </button>
  );
}

/** True from `ms` after the title first showed on this page (it may already be showing when this mounts). */
function useTitleSeenFor(scenes: SceneSignal, ms: number): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    let timer: number | undefined;
    const start = (id: string | null): void => {
      if (id === 'title' && timer === undefined) timer = window.setTimeout(() => setSeen(true), ms);
    };
    start(scenes.current);
    const stop = scenes.onSceneChange(start);
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [scenes, ms, seen]);
  return seen;
}

/** True once the game has shown `scene` on this page. */
function useSceneReached(scenes: SceneSignal, scene: string): boolean {
  const [reached, setReached] = useState(() => scenes.current === scene);
  useEffect(() => {
    if (reached) return;
    return scenes.onSceneChange((id) => {
      if (id === scene) setReached(true);
    });
  }, [scenes, scene, reached]);
  return reached;
}
