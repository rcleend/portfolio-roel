import { type CSSProperties, useCallback, useSyncExternalStore } from 'react';
import type { PropAnchor, Room, RoomView } from '@/room';
import './RoomHotspots.css';

export interface RoomHotspotsProps {
  /** The room once it is ready, else null. */
  readonly room: Room | null;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  /** The camera rests at `view`. */
  readonly settled: boolean;
  /** Called after every activation, to hand keyboard focus back to the stage. */
  readonly onActivate: () => void;
}

const NO_ANCHORS: readonly PropAnchor[] = [];

/** The chip's arrow points off the screen, towards the computer. */
const CHIP_ARROWS: Readonly<Record<NonNullable<PropAnchor['edge']>, string>> = {
  left: '◂',
  right: '▸',
  top: '▴',
  bottom: '▾',
};

/**
 * Keyboard and touch ways to the props the room's meshes offer to the mouse. Each is a real
 * button pinned on its prop, hidden until it has keyboard focus; the computer's becomes an
 * always-visible edge chip whenever the room view crops the computer out (portrait screens).
 */
export function RoomHotspots({ room, view, settled, onActivate }: RoomHotspotsProps) {
  const anchors = useAnchors(room);
  if (!room || view === 'pc') return null;
  const activate = (go: () => void) => () => {
    go();
    onActivate();
  };

  if (view === 'tv') {
    return (
      <div className="room-hotspots">
        <button
          type="button"
          className="room-hotspots__spot room-hotspots__spot--bottom"
          onClick={activate(() => room.showRoom())}
        >
          Look around the room
        </button>
      </div>
    );
  }

  const pc = anchors.find((anchor) => anchor.target === 'pc');
  const tv = anchors.find((anchor) => anchor.target === 'tv');
  return (
    <nav className="room-hotspots" aria-label="Look closer">
      {/* Only once the camera has landed: in the flight away from the computer it would hang over its monitor. */}
      {!pc?.edge ? (
        <button type="button" className="room-hotspots__spot" style={at(pc)} onClick={activate(() => room.focusPc())}>
          Use the computer
        </button>
      ) : settled ? (
        <button
          type="button"
          className="room-hotspots__chip"
          data-edge={pc.edge}
          style={at(pc)}
          aria-label="Use the computer"
          onClick={activate(() => room.focusPc())}
        >
          <ChipLabel edge={pc.edge} />
        </button>
      ) : null}
      <button type="button" className="room-hotspots__spot" style={at(tv)} onClick={activate(() => room.focusTv())}>
        Watch the TV
      </button>
    </nav>
  );
}

/** "◂ COMPUTER" on the left edge, "COMPUTER ▸" on the right; the arrow is decoration. */
function ChipLabel({ edge }: { readonly edge: NonNullable<PropAnchor['edge']> }) {
  const arrow = <span aria-hidden="true">{CHIP_ARROWS[edge]}</span>;
  return edge === 'right' ? <>Computer {arrow}</> : <>{arrow} Computer</>;
}

function at(anchor: PropAnchor | undefined): CSSProperties | undefined {
  if (!anchor) return undefined;
  return { '--x': `${anchor.x}px`, '--y': `${anchor.y}px` } as CSSProperties;
}

function useAnchors(room: Room | null): readonly PropAnchor[] {
  const subscribe = useCallback((onChange: () => void) => room?.onAnchorsChange(onChange) ?? (() => {}), [room]);
  return useSyncExternalStore(
    subscribe,
    () => room?.anchors ?? NO_ANCHORS,
    () => NO_ANCHORS,
  );
}
