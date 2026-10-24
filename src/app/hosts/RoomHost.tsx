import { type KeyboardEvent, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { Room, RoomView } from '@/room';
import { RoomHotspots } from '../overlays/room-hotspots/RoomHotspots';
import { PcSlot } from '../pc/PcSlot';
import { FlatHost } from './FlatHost';
import { FocusGatedSurface } from './FocusGatedSurface';
import type { HostProps } from './types';
import { useRoom } from './useRoom';
import './RoomHost.css';

declare global {
  interface Window {
    /** Development only: the room, so end-to-end tests can read its render stats. */
    __room?: Room;
  }
}

const STAGE_LABELS: Readonly<Record<RoomView, string>> = {
  tv: "Roel Leenders' portfolio as an arcade game on a TV. Arrow keys move, Z or Space jump and confirm, X attacks. The same content is in the résumé after this game.",
  room: 'Paused, looking around the attic. Click the computer to read the résumé or the TV to play. Tab to reach them, or press Enter to return to the TV.',
  pc: 'At the computer. The résumé opens in a document reader; press Escape to return to the room.',
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

function AtticStage({ surface, powered, insets, events, onUnavailable }: HostProps & { onUnavailable(): void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const screensRef = useRef<HTMLDivElement>(null);
  // One gate per surface; the room only ever sees the gated view.
  const [gated] = useState(() => new FocusGatedSurface(surface));
  const status = useRoom(stageRef, screensRef, gated, events.onProgress);
  const room = status.state === 'ready' ? status.room : null;
  const [view, setView] = useState<RoomView>('tv');
  // Whether the camera rests at `view`: what waits for the landing (the computer chip, its prefetch) reads it.
  const [settled, setSettled] = useState(true);
  // The computer's prefetch waits for the picture: nothing may compete with the TV turning on.
  const [tvOn, setTvOn] = useState(false);
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

  useEffect(() => {
    if (!room || !powered || room.powerState !== 'off') return;
    room.powerOn().then(poweredOn, (error: unknown) => console.error('TV failed to power on', error));
  }, [room, powered]);

  const { top, right, bottom, left } = insets;
  useEffect(() => {
    room?.setFramingInsets({ top, right, bottom, left });
  }, [room, top, right, bottom, left]);

  const focusStage = (): void => stageRef.current?.focus({ preventScroll: true });

  // Escape belongs to the game at the TV; at the computer it gets up again (also mid-flight, or
  // after a click on the bezel moved focus back here). In the room, Enter or Space plays again.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!room) return;
    if (room.view === 'pc') {
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

  // The screens, hotspots and the PC slot are siblings of the stage, never children: events from
  // their portals must not bubble into the stage's handlers, and focus inside them leaves the
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
      <RoomHotspots room={room} view={view} settled={settled} onActivate={focusStage} />
      <PcSlot
        display={room?.pc ?? null}
        view={view}
        settled={settled}
        powered={tvOn}
        onLeave={() => room?.showRoom()}
        onFocusStage={focusStage}
      />
    </>
  );
}
