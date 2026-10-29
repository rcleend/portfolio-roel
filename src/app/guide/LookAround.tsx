import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SceneSignal } from '../hosts/types';
import { ClickOutsideIcon } from './icons';

export interface LookAroundProps {
  /** Flies to the room view, as a click outside the TV does with a mouse (on a touch screen only this does). */
  readonly onLookAround: () => void;
  /** Shown as the popup (useLookAroundPopup). */
  readonly shown: boolean;
  /** Its first showing on this page: the pictogram plays. */
  readonly intro: boolean;
  readonly touch: boolean;
  /** Set when the host's way out had the keyboard as this took its place: this button takes the focus (RoomHost.tsx). */
  readonly handOver: RefObject<boolean>;
}

/** Long enough to get into the level, soon enough to be found: the popup's wait from the first level's first frame. */
export const LOOK_AROUND_HINT_DELAY_MS = 5000;

/**
 * The TV view's way out (docs/ART-DIRECTION.md › The room's UI). Always a button, first after the stage in tab order,
 * hidden until it has keyboard focus; five seconds after the first level starts on this page it appears as a pill
 * under the TV (over it on touch screens, where the pad has the bottom), "Tired of playing?" over "Click outside the
 * TV to explore" ("Tap here to explore the room" on touch screens, where it is the only way out of the game), and from
 * then on it is there whenever the camera rests on the TV. Clicking it flies to the room, as a click beside the TV
 * does. Its pictogram clicks beside a little screen the first time only, so a returning visitor finds it quiet.
 */
export function LookAround({ onLookAround, shown, intro, touch, handOver }: LookAroundProps) {
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
      data-intro={intro}
      data-touch={touch}
      aria-label="Tired of playing? Look around the room"
      onClick={onLookAround}
    >
      <ClickOutsideIcon />
      <span className="guide-pill__words" aria-hidden="true">
        <span className="guide-pill__title">Tired of playing?</span>
        <span className="guide-pill__body">
          {touch ? 'Tap here to explore the room' : 'Click outside the TV to explore'}
        </span>
      </span>
    </button>
  );
}

/**
 * When the TV's way out shows as the popup: from five seconds after a level first started on this page, whenever
 * `atTv` (the camera rests on the TV). Kept by the guide, which stays mounted while the popup comes and goes.
 */
export function useLookAroundPopup(scenes: SceneSignal, atTv: boolean): { shown: boolean; intro: boolean } {
  const due = useSceneSeenFor(scenes, 'level', LOOK_AROUND_HINT_DELAY_MS);
  const shown = atTv && due;
  return { shown, intro: !useFirstShowingOver(shown) };
}

/** True from `ms` after scene `scene` first showed on this page (it may already be showing when this mounts). */
function useSceneSeenFor(scenes: SceneSignal, scene: string, ms: number): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    let timer: number | undefined;
    const start = (id: string | null): void => {
      if (id === scene && timer === undefined) timer = window.setTimeout(() => setSeen(true), ms);
    };
    start(scenes.current);
    const stop = scenes.onSceneChange(start);
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [scenes, scene, ms, seen]);
  return seen;
}

/** True once `shown` has been true and gone false again: the first showing is over. */
function useFirstShowingOver(shown: boolean): boolean {
  const [state, setState] = useState<'before' | 'showing' | 'over'>('before');
  if (shown && state === 'before') setState('showing');
  if (!shown && state === 'showing') setState('over');
  return state === 'over';
}
