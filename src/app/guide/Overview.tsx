import { type CSSProperties, useId, useState } from 'react';
import type { RoomTarget } from '@/room';
import { lastInputWasKeyboard } from '../a11y/inputModality';
import type { Presence } from './presence';
import { PROP_ACCESSIBLE_NAMES, PROP_NAMES } from './propNames';
import { Socials } from './Socials';

export interface OverviewProps {
  /**
   * Arriving or leaving (presence.ts), or `idle`: mounted ahead, hidden, while the camera is elsewhere. The guide
   * keeps it in the page from the start, so its first show only starts its arrival on parts long laid out with their
   * marks loaded, as every later show does (round six, item 32: on a phone the first show used to mount it mid-flight
   * and its parts flickered in and out).
   */
  readonly presence: Exclude<Presence, null> | 'idle';
  /** The camera is still on its way in: the overview arrives as it lands. */
  readonly arriving: boolean;
  /** The camera rests in the room view: only then does the menu take a pointer. */
  readonly settled: boolean;
  /** The prop in the light, from the menu, the tour or the pointer on the prop itself. */
  readonly lit: RoomTarget | null;
  /** The radio works (else it is scenery and has no item). */
  readonly radio: boolean;
  /** The item under the pointer (null: none). */
  readonly onHover: (target: RoomTarget | null) => void;
  /** The item the keyboard has (null: none); a pointer's focus is not one, as its pill is not either. */
  readonly onKeyboard: (target: RoomTarget | null) => void;
  readonly onPick: (target: RoomTarget) => void;
}

/** The menu, in the order the room reads from left to right, with where each item goes for screen readers. */
const ITEMS: readonly { readonly target: RoomTarget; readonly does: string }[] = [
  { target: 'pc', does: 'Read it at the computer.' },
  { target: 'radio', does: 'Play a CD on the radio.' },
  { target: 'tv', does: 'Play it on the TV.' },
];

/**
 * The room view's overview (docs/ART-DIRECTION.md › The room's UI), its parts in the corners so the room stays in the
 * middle: the name small in the top-left with the menu (About, Music, Game) on its centre line, the line saying what
 * the room is in the bottom-left, the quick links in the bottom-right. On an upright phone the menu stands large in the
 * middle instead. Pointing at or focusing an item lights its prop in the room, and pointing at a prop lights its item,
 * so the two read as one.
 */
export function Overview({
  presence,
  arriving: arrivingNow,
  settled,
  lit,
  radio,
  onHover,
  onKeyboard,
  onPick,
}: OverviewProps) {
  // How it came in decides its whole arrival, so a landing midway never re-times it; each show decides its own.
  const [arriving, setArriving] = useState(arrivingNow);
  const [shownAs, setShownAs] = useState(presence);
  if (presence !== shownAs) {
    setShownAs(presence);
    if (presence === 'in') setArriving(arrivingNow);
  }
  const id = useId();
  const items = radio ? ITEMS : ITEMS.filter((item) => item.target !== 'radio');
  return (
    <nav
      className="overview"
      aria-label="Roel's room"
      data-presence={presence}
      aria-hidden={presence === 'idle' ? true : undefined}
      data-arriving={arriving}
      data-settled={settled}
    >
      <div className="overview__bar">
        <p className="overview__name" aria-hidden="true" style={order(0)}>
          <span>RO</span>
          <span>EL</span>
        </p>
        <ul className="overview__menu">
          {items.map(({ target, does }, index) => (
            <li key={target} style={order(1 + index)}>
              <button
                type="button"
                className="overview__item"
                data-target={target}
                data-lit={lit === target}
                aria-label={PROP_ACCESSIBLE_NAMES[target]}
                aria-describedby={`${id}${target}`}
                onPointerEnter={() => onHover(target)}
                onPointerLeave={() => onHover(null)}
                onFocus={() => onKeyboard(lastInputWasKeyboard() ? target : null)}
                onBlur={() => onKeyboard(null)}
                onClick={() => onPick(target)}
              >
                {PROP_NAMES[target]}
              </button>
              <span id={`${id}${target}`} className="guide-hidden">
                {does}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="overview__label" style={order(4)}>
        A glimpse into my past
      </p>
      <Socials style={order(5)} />
    </nav>
  );
}

/** Where a part comes in the arrival's stagger. */
function order(index: number): CSSProperties {
  return { '--order': index } as CSSProperties;
}
