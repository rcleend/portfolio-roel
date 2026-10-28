import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PropSpotlight, Room, RoomTarget, RoomView } from '@/room';
import type { SceneSignal } from '../hosts/types';
import { browserStorage } from '../storage/localFlag';
import { COARSE_POINTER, useMediaQuery } from '../useMediaQuery';
import {
  type GuideProgress,
  leaveHintDue,
  loadGuideProgress,
  recordTour,
  recordView,
  saveGuideProgress,
} from './guideProgress';
import { LeaveHint } from './LeaveHint';
import { LookAround } from './LookAround';
import { Overview } from './Overview';
import { PropLabel } from './PropLabel';
import { usePresence } from './presence';
import './RoomGuide.css';

export interface RoomGuideProps {
  readonly room: Room;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  /** The camera rests at `view`. */
  readonly settled: boolean;
  readonly scenes: SceneSignal;
  /** Set when the host's own way out went with the keyboard on it: the hint's button takes the focus (RoomHost.tsx). */
  readonly handOver: RefObject<boolean>;
  /** Hands keyboard focus back to the stage, once a button here has sent the camera off. */
  readonly onFocusStage: () => void;
}

/** The overview's way out: quicker than its way in, and over before the flight is a third done. */
const OVERVIEW_EXIT_MS = 180;

/** The tour waits for the overview to arrive, then lights each prop in turn, its menu item with it. */
const TOUR_START_MS = 450;
const TOUR_STEP_MS = 750;
/** A mouse that moves further than this (CSS px) has the visitor exploring: the tour stops. */
const TOUR_POINTER_SLOP = 8;

const GO: Readonly<Record<RoomTarget, (room: Room) => void>> = {
  pc: (room) => room.focusPc(),
  radio: (room) => room.focusRadio(),
  tv: (room) => room.focusTv(),
};

/**
 * Everything the room host shows around the TV and the computer besides the sound toggle (docs/ART-DIRECTION.md ›
 * The room's UI): the TV view's way out and its click-outside hint, the room view's overview with its menu, the label
 * over the prop in the light, and at the computer how to get up. A lazy chunk the room host loads once the TV's
 * picture is up.
 */
export function RoomGuide({ room, view, settled, scenes, handOver, onFocusStage }: RoomGuideProps): ReactNode {
  const touch = useMediaQuery(COARSE_POINTER);
  const [progress, learn] = useGuideProgress(view);
  const lit = useLitTarget(room.spotlight);
  const radio = useRadioAvailable(room);
  // What the app lights: the menu item under the pointer, else the one the keyboard has, else the tour's prop. The
  // pointer wins while it is over an item; as it leaves, a focused item lights again (as room.spotlight layers its
  // own request over a hover).
  const [hovered, setHovered] = useState<RoomTarget | null>(null);
  const [focused, setFocused] = useState<RoomTarget | null>(null);
  const [touring, setTouring] = useState<RoomTarget | null>(null);
  const pointed = hovered ?? focused;
  const inRoom = view === 'room';
  const overview = usePresence(inRoom, OVERVIEW_EXIT_MS);
  const pointer = usePointer();
  useTour(inRoom && settled && !progress.toured, radio, pointer, setTouring, () => learn(recordTour));

  const request = inRoom ? (pointed ?? touring) : null;
  useEffect(() => room.spotlight.light(request), [room, request]);
  // Reaching for the music is intent: the radio's device and sharper skin get ready, as a hover on the radio does.
  useEffect(() => {
    if (pointed === 'radio') room.radio.prefetch('intent');
  }, [room, pointed]);
  useEffect(() => () => room.spotlight.light(null), [room]);

  const go = (target: RoomTarget): void => {
    setHovered(null);
    setFocused(null);
    GO[target](room);
    onFocusStage();
  };

  return (
    <>
      {view === 'tv' ? (
        <LookAround
          onLookAround={() => {
            room.showRoom();
            onFocusStage();
          }}
          scenes={scenes}
          atTv={settled}
          learnt={progress.lookedAround}
          touch={touch}
          handOver={handOver}
        />
      ) : null}
      {overview ? (
        <Overview
          presence={overview}
          arriving={!settled}
          settled={settled}
          lit={inRoom ? lit : null}
          radio={radio}
          onHover={setHovered}
          onKeyboard={setFocused}
          onPick={go}
        />
      ) : null}
      <PropLabel spotlight={room.spotlight} />
      <LeaveHint due={view === 'pc' && settled && leaveHintDue(progress, touch)} />
    </>
  );
}

/** The visitor's progress, learning from every view change and kept for later visits. */
function useGuideProgress(
  view: RoomView,
): readonly [GuideProgress, (change: (p: GuideProgress) => GuideProgress) => void] {
  const [storage] = useState(browserStorage);
  const [progress, setProgress] = useState(() => loadGuideProgress(storage));
  const learn = useCallback(
    (change: (current: GuideProgress) => GuideProgress) =>
      setProgress((current) => {
        const next = change(current);
        if (next !== current) saveGuideProgress(storage, next);
        return next;
      }),
    [storage],
  );
  useEffect(() => learn((current) => recordView(current, view)), [view, learn]);
  return [progress, learn];
}

/**
 * The first time the camera rests in the room view (ever, in this browser), the props light up one by one, each with
 * its menu item: what can be clicked, and which item goes where, without a word. Over in about two and a half
 * seconds, and cut short the moment the visitor moves the mouse, touches, types or leaves; either way it never plays
 * again.
 */
function useTour(
  due: boolean,
  radio: boolean,
  pointer: RefObject<Point | null>,
  light: (target: RoomTarget | null) => void,
  onDone: () => void,
): void {
  const done = useEffectEvent(onDone);
  useEffect(() => {
    if (!due) return;
    const steps: readonly (RoomTarget | null)[] = radio ? ['pc', 'radio', 'tv', null] : ['pc', 'tv', null];
    let step = 0;
    // Where the mouse rests as it starts, or wherever it first reports itself (null: it has not moved on this page,
    // as after a keyboard arrival). The browser re-sends a resting pointer's place when the page changes under it,
    // which is not the visitor exploring, so that first place becomes the reference rather than the end of the tour.
    let origin = pointer.current;
    const next = (): void => {
      const target = steps[step++] ?? null;
      light(target);
      if (target) timer = window.setTimeout(next, TOUR_STEP_MS);
      else done();
    };
    let timer = window.setTimeout(next, TOUR_START_MS);
    const stop = (): void => {
      light(null);
      done();
    };
    const moved = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      if (!origin) origin = { x: event.clientX, y: event.clientY };
      else if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TOUR_POINTER_SLOP) stop();
    };
    const options = { capture: true, passive: true } as const;
    window.addEventListener('pointermove', moved, options);
    window.addEventListener('pointerdown', stop, options);
    window.addEventListener('keydown', stop, options);
    window.addEventListener('wheel', stop, options);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', moved, options);
      window.removeEventListener('pointerdown', stop, options);
      window.removeEventListener('keydown', stop, options);
      window.removeEventListener('wheel', stop, options);
      light(null);
    };
  }, [due, radio, pointer, light]);
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where the mouse last was on the page, or null before it has moved. */
function usePointer(): RefObject<Point | null> {
  const pointer = useRef<Point | null>(null);
  useEffect(() => {
    const track = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse') pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', track, { passive: true });
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerdown', track);
    };
  }, []);
  return pointer;
}

/** The prop in the light, whoever lit it (the room's pointer, the menu, the tour). */
function useLitTarget(spotlight: PropSpotlight): RoomTarget | null {
  const subscribe = useCallback((onChange: () => void) => spotlight.onChange(onChange), [spotlight]);
  return useSyncExternalStore(
    subscribe,
    () => spotlight.lit?.target ?? null,
    () => null,
  );
}

/** The radio's item shows only while the radio can work (its close-up loaded or not yet tried). */
function useRadioAvailable(room: Room): boolean {
  const subscribe = useCallback((onChange: () => void) => room.radio.onAvailableChange(onChange), [room]);
  return useSyncExternalStore(
    subscribe,
    () => room.radio.available,
    () => false,
  );
}
