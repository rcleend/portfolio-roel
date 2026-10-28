import { type CSSProperties, useId, useState } from 'react';
import type { RoomTarget } from '@/room';
import { PropIcon } from './icons';
import type { Presence } from './presence';
import { PROP_NAMES } from './propNames';

export interface OverviewProps {
  /** Arriving or leaving (presence.ts). */
  readonly presence: Exclude<Presence, null>;
  /** The camera is still on its way in: the overview arrives as it lands. */
  readonly arriving: boolean;
  /** The camera rests in the room view: only then does the menu take a pointer. */
  readonly settled: boolean;
  /** The prop in the light, from the menu, the tour or the pointer on the prop itself. */
  readonly lit: RoomTarget | null;
  /** The radio works (else it is scenery and has no item). */
  readonly radio: boolean;
  /** A menu item has the pointer or the keyboard (null: none). */
  readonly onPoint: (target: RoomTarget | null) => void;
  readonly onPick: (target: RoomTarget) => void;
}

/** The menu, in the order the room reads from left to right, with where each item goes for screen readers. */
const ITEMS: readonly { readonly target: RoomTarget; readonly does: string }[] = [
  { target: 'pc', does: 'Read it at the computer.' },
  { target: 'radio', does: 'Play a CD on the radio.' },
  { target: 'tv', does: 'Play it on the TV.' },
];

/**
 * The room view's title card (docs/ART-DIRECTION.md › The room's UI): the name stacked RO over EL in Chewy, a
 * gallery label for the room, and a three-item menu to the résumé, the music and the game. Pointing at or focusing an
 * item lights its prop in the room, and pointing at a prop lights its item, so the two read as one.
 */
export function Overview({ presence, arriving: arrivingNow, settled, lit, radio, onPoint, onPick }: OverviewProps) {
  // How it came in decides its whole arrival, so a landing midway never re-times it.
  const [arriving] = useState(arrivingNow);
  const id = useId();
  const items = radio ? ITEMS : ITEMS.filter((item) => item.target !== 'radio');
  return (
    <nav
      className="overview"
      aria-label="Roel's room"
      data-presence={presence}
      data-arriving={arriving}
      data-settled={settled}
    >
      <p className="overview__name" aria-hidden="true">
        <span style={order(0)}>RO</span>
        <span style={order(1)}>EL</span>
      </p>
      <p className="overview__label" style={order(2)}>
        <span className="overview__title">Childhood room, ca. 2007</span>
        <span className="overview__note">Mixed media. Please touch.</span>
      </p>
      <ul className="overview__menu">
        {items.map(({ target, does }, index) => (
          <li key={target} style={order(3 + index)}>
            <button
              type="button"
              className="overview__item"
              data-target={target}
              data-lit={lit === target}
              aria-describedby={`${id}${target}`}
              onPointerEnter={() => onPoint(target)}
              onPointerLeave={() => onPoint(null)}
              onFocus={() => onPoint(target)}
              onBlur={() => onPoint(null)}
              onClick={() => onPick(target)}
            >
              <PropIcon target={target} />
              {PROP_NAMES[target]}
            </button>
            <span id={`${id}${target}`} className="guide-hidden">
              {does}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Where a part comes in the arrival's stagger. */
function order(index: number): CSSProperties {
  return { '--order': index } as CSSProperties;
}
