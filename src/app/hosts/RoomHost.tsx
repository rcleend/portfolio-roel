import { type KeyboardEvent, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { RoomView } from '@/room';
import { FlatHost } from './FlatHost';
import { FocusGatedSurface } from './FocusGatedSurface';
import type { HostProps } from './types';
import { useRoom } from './useRoom';
import './RoomHost.css';

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
  // One gate per surface; the room only ever sees the gated view.
  const [gated] = useState(() => new FocusGatedSurface(surface));
  const status = useRoom(stageRef, gated, events.onProgress);
  const room = status.state === 'ready' ? status.room : null;
  const [view, setView] = useState<RoomView>('tv');
  // Chrome treats the opening programmatic focus as focus-visible; draw the ring only after a real Tab.
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  const ready = useEffectEvent(() => events.onReady('room'));
  const poweredOn = useEffectEvent(() => events.onPoweredOn());
  const viewChanged = useEffectEvent((next: RoomView) => {
    setView(next);
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
    return room.onViewChange(viewChanged);
  }, [room]);

  useEffect(() => {
    if (!room || !powered || room.powerState !== 'off') return;
    room.powerOn().then(poweredOn, (error: unknown) => console.error('TV failed to power on', error));
  }, [room, powered]);

  const { top, right, bottom, left } = insets;
  useEffect(() => {
    room?.setFramingInsets({ top, right, bottom, left });
  }, [room, top, right, bottom, left]);

  const navigate = (next: RoomView): void => {
    if (next === 'tv') room?.focusTv();
    else if (next === 'room') room?.showRoom();
    else room?.focusSection(next);
    stageRef.current?.focus({ preventScroll: true });
  };

  // Escape belongs to the game at the TV; in a prop close-up it pulls back to the room.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!room) return;
    if (room.view === 'desk' || room.view === 'drawer') {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      navigate('room');
    } else if (
      event.target === event.currentTarget &&
      room.view === 'room' &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      navigate('tv');
    }
  };

  return (
    <div
      ref={stageRef}
      className="room-host"
      data-host="room"
      data-view={view}
      data-ready={room ? 'true' : 'false'}
      data-focus-ring={keyboardFocus ? 'true' : 'false'}
      role="application"
      aria-roledescription="arcade game"
      aria-label={
        view === 'tv'
          ? "Roel Leenders' portfolio as an arcade game on a TV. Arrow keys move, Z or Space jump and confirm, X attacks. The same content is in the résumé after this game."
          : view === 'room'
            ? 'Paused, looking around the attic. Click the desk, radio cabinet or TV to look closer. Tab to room navigation, or press Enter to return to the TV.'
            : `Looking at the ${view === 'desk' ? 'desktop' : 'radio and lava-lamp cabinet'}. Press Escape or click outside to return to the room.`
      }
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
    >
      {room && view !== 'tv' ? (
        <nav className="room-navigation" aria-label="Room views">
          {view !== 'room' ? (
            <button type="button" onClick={() => navigate('room')}>
              <span aria-hidden="true">← </span>Room
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Zoom in on desktop"
            aria-pressed={view === 'desk'}
            onClick={() => navigate(view === 'desk' ? 'room' : 'desk')}
          >
            Desk
          </button>
          <button
            type="button"
            aria-label="Zoom in on radio and lava lamp"
            aria-pressed={view === 'drawer'}
            onClick={() => navigate(view === 'drawer' ? 'room' : 'drawer')}
          >
            Radio
          </button>
          <button type="button" aria-label="Return to TV" onClick={() => navigate('tv')}>
            TV
          </button>
        </nav>
      ) : null}
    </div>
  );
}
