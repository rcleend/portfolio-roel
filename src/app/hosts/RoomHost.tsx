import {
  type KeyboardEvent,
  lazy,
  type RefObject,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Room, RoomView } from '@/room';
import { PcSlot } from '../pc/PcSlot';
import { whenIdle } from '../pc/whenIdle';
import { FlatHost } from './FlatHost';
import { FocusGatedSurface } from './FocusGatedSurface';
import { StillPicture } from './StillPicture';
import type { HostProps } from './types';
import { useRoom } from './useRoom';
import './RoomHost.css';

/**
 * The CD player's glue leaves the first load (docs/RADIO.md › Loading): it mounts, in a transition, the first time the
 * camera rests away from the TV or heads for the radio, never inside the click that leaves the TV. Should only this glue fail, the radio stays without its music, and
 * Escape or a click beside it still leads back to the room.
 */
const RadioSlot = lazy(() =>
  import('../radio/RadioSlot').then(
    (module) => ({ default: module.RadioSlot }),
    (error: unknown) => {
      console.warn('The CD player failed to load', error);
      return { default: () => null };
    },
  ),
);

/**
 * The room's guide (docs/ART-DIRECTION.md › The room's UI: the TV's way out and its click-outside hint, the room
 * view's overview and menu, the props' labels, the way up from the computer) leaves the first load: it is fetched at
 * idle once the TV's picture is up, long before its first hint is due, and mounts only once it is in. The stage's own
 * keys only play again (Enter in the room view) and get up (Escape at the computer or the radio), so the TV's way out
 * is `WayOut`, in the first load, which stays exactly as long as the guide's own is not there.
 */
const RoomGuide = lazy(() => import('../guide/RoomGuide').then((module) => ({ default: module.RoomGuide })));

/**
 * The TV view's way out, with the same name the guide's hint wears: unseen until it takes keyboard focus, then a pill
 * over the room. The guide's own, which also teaches the click outside, takes its place once it is in, so there is
 * only ever one; `handOver` tells it to take the keyboard with it when it does.
 */
function WayOut({
  view,
  onLookAround,
  handOver,
}: {
  readonly view: RoomView;
  readonly onLookAround: () => void;
  readonly handOver: RefObject<boolean>;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(
    () => () => {
      if (button.current !== null && document.activeElement === button.current) handOver.current = true;
    },
    [handOver],
  );
  if (view !== 'tv') return null;
  return (
    <button ref={button} type="button" className="way-out" onClick={onLookAround}>
      Look around the room
    </button>
  );
}

declare global {
  interface Window {
    /** Development only: the room, so end-to-end tests can read its render stats. */
    __room?: Room;
  }
}

const STAGE_LABELS: Readonly<Record<RoomView, string>> = {
  tv: "Roel Leenders' portfolio as an arcade game on a TV. Arrow keys move, Z or Space jump and confirm, X attacks. The same content is in the résumé after this game.",
  room: 'Paused, looking around the attic. Click the computer to read the résumé, the radio to play music, or the TV to play. Tab to the menu to reach them, or press Enter to return to the TV.',
  pc: 'At the computer. Press Escape to return to the room.',
  radio:
    "At the CD player. Tab to the CDs and press Enter to play one, or to the player's own keys to pause, stop or skip a track. Press Escape to return to the room.",
};

/**
 * The attic room presenting the game on its CRT. Falls back to the flat TV
 * whenever the room cannot run (no WebGL, failed download), so the visitor
 * always gets a game.
 */
export function RoomHost(props: HostProps) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <FlatHost {...props} />;
  return <AtticStage {...props} onUnavailable={() => setUnavailable(true)} />;
}

function AtticStage({
  surface,
  scenes,
  powered,
  still,
  insets,
  events,
  muted,
  onUnavailable,
}: HostProps & { onUnavailable(): void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const screensRef = useRef<HTMLDivElement>(null);
  // One gate per surface; the room only ever sees the gated view.
  const [gated] = useState(() => new FocusGatedSurface(surface));
  const status = useRoom(stageRef, screensRef, gated);
  const room = status.state === 'ready' ? status.room : null;
  const [view, setView] = useState<RoomView>('tv');
  // Whether the camera rests at `view`: what waits for the landing (the computer chip, its prefetch) reads it.
  const [settled, setSettled] = useState(true);
  // The computer's prefetch waits for the picture: nothing may compete with the TV turning on.
  const [tvOn, setTvOn] = useState(false);
  // The camera has rested away from the TV (or headed for the radio): the CD player's glue loads (see RadioSlot above).
  const [radioDue, setRadioDue] = useState(false);
  // The TV's picture is up and the page idle: the guide loads (see RoomGuide above).
  const [guideDue, setGuideDue] = useState(false);
  // Chrome treats the opening programmatic focus as focus-visible; draw the ring only after a real Tab.
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  const ready = useEffectEvent(() => events.onReady('room'));
  const poweredOn = useEffectEvent(() => {
    setTvOn(true);
    events.onPoweredOn();
  });
  const viewChanged = useEffectEvent((next: RoomView) => {
    setView(next);
    setSettled(false);
    events.onViewChange(next);
  });
  const unavailable = useEffectEvent(onUnavailable);
  const stillDone = useEffectEvent(() => events.onStillDone());

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // The page opens on the TV: keys go straight to the game without a click first.
    stage.focus({ preventScroll: true });
    gated.setFocused(document.activeElement === stage);
    return () => gated.setFocused(false);
  }, [gated]);

  useEffect(() => {
    if (status.state === 'unavailable') unavailable();
  }, [status.state]);

  useEffect(() => {
    if (!room) return;
    ready();
    if (import.meta.env.DEV) window.__room = room;
    const stop = room.onViewChange(viewChanged);
    const stopSettle = room.onSettle(() => setSettled(true));
    return () => {
      stop();
      stopSettle();
      if (import.meta.env.DEV && window.__room === room) delete window.__room;
    };
  }, [room]);

  // On the startup still the flat picture turns on and the game starts there (StillPicture); the room's tube then
  // lights at once, already showing the game, for the hand-over. Without the still, the room turns its tube on itself.
  useEffect(() => {
    if (room?.powerState !== 'off' || (still ? !tvOn : !powered)) return;
    room
      .powerOn({ instant: still })
      .then(still ? undefined : poweredOn, (error: unknown) => console.error('TV failed to power on', error));
  }, [room, powered, still, tvOn]);

  // The hand-over (docs/ROOM.md › Startup): the visitor's first press, the game leaving its title, or the camera
  // leaving the TV fades the still out over the identical live scene, as soon as the room shows the game (a press
  // before that is remembered).
  const pressed = useRef(false);
  useEffect(() => {
    if (!still) return;
    const opening = (id: string | null): boolean => id === null || id === 'boot' || id === 'title';
    const check = (): void => {
      const due = pressed.current || !opening(scenes.current) || (room !== null && room.view !== 'tv');
      if (due && room?.powerState === 'on' && tvOn) stillDone();
    };
    const press = (): void => {
      pressed.current = true;
      check();
    };
    check();
    const stopScenes = scenes.onSceneChange(check);
    const stopViews = room?.onViewChange(check);
    const options = { capture: true, passive: true } as const;
    window.addEventListener('keydown', press, options);
    window.addEventListener('pointerdown', press, options);
    return () => {
      stopScenes();
      stopViews?.();
      window.removeEventListener('keydown', press, options);
      window.removeEventListener('pointerdown', press, options);
    };
  }, [still, room, tvOn, scenes]);

  useEffect(() => {
    if (!tvOn || guideDue) return;
    return whenIdle(() => {
      import('../guide/RoomGuide').then(
        () => startTransition(() => setGuideDue(true)),
        (error: unknown) => console.warn("The room's guide failed to load", error),
      );
    });
  }, [tvOn, guideDue]);

  // Mounting a lazy component costs a slow phone more than the click that leaves the TV itself (the import, the
  // suspension and the commit), so it waits for the landing, out of the click and the flight, as a transition. The
  // slot does nothing until then anyway: its prefetch waits for a settled room and its load for the radio view.
  useEffect(() => {
    if (radioDue || view === 'tv' || !(settled || view === 'radio')) return;
    startTransition(() => setRadioDue(true));
  }, [radioDue, view, settled]);

  const { top, right, bottom, left } = insets;
  useEffect(() => {
    room?.setFramingInsets({ top, right, bottom, left });
  }, [room, top, right, bottom, left]);

  // Stable, so a view change never re-renders the computer's screen or the radio's controls through their props.
  const focusStage = useCallback((): void => stageRef.current?.focus({ preventScroll: true }), []);
  const showRoom = useCallback(() => room?.showRoom(), [room]);
  const lookAround = useCallback(() => {
    room?.showRoom();
    focusStage();
  }, [room, focusStage]);
  // The way out and the guide's hint are one control to the visitor: this notes a keyboard standing on the way out as
  // the guide takes over, so the hint's own button takes the focus rather than dropping it.
  const handOver = useRef(false);

  // Escape belongs to the game at the TV; at the computer or the radio it gets up again (also mid-flight,
  // or after a click on the bezel moved focus back here). In the room, Enter or Space plays again.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!room) return;
    if (room.view === 'pc' || room.view === 'radio') {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      room.showRoom();
    } else if (
      event.target === event.currentTarget &&
      room.view === 'room' &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      room.focusTv();
    }
  };

  const wayOut = room ? <WayOut view={view} onLookAround={lookAround} handOver={handOver} /> : null;

  // The screens, the guide and the PC and radio slots are siblings of the stage, never children: events
  // from their portals must not bubble into the stage's handlers, and focus inside them leaves the
  // stage, which is what takes the keyboard away from the game.
  return (
    <>
      <div
        ref={stageRef}
        className="room-host"
        data-host="room"
        data-view={view}
        data-ready={room ? 'true' : 'false'}
        data-focus-ring={keyboardFocus ? 'true' : 'false'}
        role="application"
        aria-roledescription="arcade game"
        aria-label={STAGE_LABELS[view]}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is the game's keyboard focus target.
        tabIndex={0}
        onFocus={(event) => gated.setFocused(event.target === event.currentTarget)}
        onBlur={() => {
          gated.setFocused(false);
          setKeyboardFocus(false);
        }}
        // Tab's keyup lands on the element focus moved to: that is how keyboard arrival is told apart.
        onKeyUp={(event) => {
          if (event.key === 'Tab') setKeyboardFocus(true);
        }}
        onPointerDown={() => setKeyboardFocus(false)}
        onKeyDown={onKeyDown}
      />
      <div ref={screensRef} className="room-host__screens" />
      <StillPicture surface={surface} powered={powered} onLit={poweredOn} passThrough={room !== null} />
      {room && guideDue ? (
        <Suspense fallback={wayOut}>
          <RoomGuide
            room={room}
            view={view}
            settled={settled}
            scenes={scenes}
            handOver={handOver}
            onFocusStage={focusStage}
          />
        </Suspense>
      ) : (
        wayOut
      )}
      <PcSlot
        display={room?.pc ?? null}
        view={view}
        settled={settled}
        powered={tvOn}
        onLeave={showRoom}
        onFocusStage={focusStage}
      />
      {room && radioDue ? (
        <Suspense fallback={null}>
          <RadioSlot
            door={room.radio}
            view={view}
            settled={settled}
            powered={tvOn}
            muted={muted}
            onLeave={showRoom}
            onFocusStage={focusStage}
          />
        </Suspense>
      ) : null}
    </>
  );
}
