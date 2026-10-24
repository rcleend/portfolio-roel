import { type CSSProperties, useCallback, useSyncExternalStore } from 'react';
import type { PropAnchor, Room, RoomTarget, RoomView } from '@/room';
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

/** The chip's arrow points off the screen, towards the prop. */
const CHIP_ARROWS: Readonly<Record<NonNullable<PropAnchor['edge']>, string>> = {
  left: '◂',
  right: '▸',
  top: '▴',
  bottom: '▾',
};

/** The props the room view reaches, in tab order, with what their button says and its chip's short name. */
interface Hotspot {
  readonly target: RoomTarget;
  readonly label: string;
  /** The edge chip's text when the prop is cropped out; null keeps the button hidden until focused. */
  readonly chip: string | null;
  readonly go: (room: Room) => void;
}

const HOTSPOTS: readonly Hotspot[] = [
  { target: 'pc', label: 'Use the computer', chip: 'Computer', go: (room) => room.focusPc() },
  { target: 'tv', label: 'Watch the TV', chip: null, go: (room) => room.focusTv() },
  { target: 'radio', label: 'Play some music', chip: 'Radio', go: (room) => room.focusRadio() },
];

/**
 * Keyboard and touch ways to the props the room's meshes offer to the mouse. Each is a real
 * button pinned on its prop, hidden until it has keyboard focus; a prop other than the TV becomes
 * an always-visible edge chip whenever the room view crops it out (portrait screens).
 */
export function RoomHotspots({ room, view, settled, onActivate }: RoomHotspotsProps) {
  const anchors = useAnchors(room);
  const radioAvailable = useRadioAvailable(room);
  if (!room || view === 'pc' || view === 'radio') return null;
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

  return (
    <nav className="room-hotspots" aria-label="Look closer">
      {HOTSPOTS.filter((spot) => spot.target !== 'radio' || radioAvailable).map((spot) => {
        const anchor = anchors.find((entry) => entry.target === spot.target);
        // Reaching the radio by keyboard is intent too: its device and sharper skin get ready.
        const onFocus = spot.target === 'radio' ? () => room.radio.prefetch('intent') : undefined;
        if (spot.chip && anchor?.edge) {
          // Only once the camera has landed: in the flight away from a prop its chip would hang over it.
          if (!settled) return null;
          return (
            <button
              key={spot.target}
              type="button"
              className="room-hotspots__chip"
              data-edge={anchor.edge}
              style={at(anchor)}
              aria-label={spot.label}
              onFocus={onFocus}
              onClick={activate(() => spot.go(room))}
            >
              <ChipLabel edge={anchor.edge} name={spot.chip} />
            </button>
          );
        }
        return (
          <button
            key={spot.target}
            type="button"
            className="room-hotspots__spot"
            style={at(anchor)}
            onFocus={onFocus}
            onClick={activate(() => spot.go(room))}
          >
            {spot.label}
          </button>
        );
      })}
    </nav>
  );
}

/** "◂ COMPUTER" on the left edge, "RADIO ▸" on the right; the arrow is decoration. */
function ChipLabel({ edge, name }: { readonly edge: NonNullable<PropAnchor['edge']>; readonly name: string }) {
  const arrow = <span aria-hidden="true">{CHIP_ARROWS[edge]}</span>;
  return edge === 'right' ? (
    <>
      {name} {arrow}
    </>
  ) : (
    <>
      {arrow} {name}
    </>
  );
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

/** The radio's hotspot shows only while the radio can work (its close-up loaded or not yet tried). */
function useRadioAvailable(room: Room | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => room?.radio.onAvailableChange(onChange) ?? (() => {}),
    [room],
  );
  return useSyncExternalStore(
    subscribe,
    () => room?.radio.available ?? false,
    () => false,
  );
}
