import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { nextRovingIndex } from '../../a11y/roving';
import { REDUCED_MOTION, useMediaQuery } from '../../useMediaQuery';
import type { RadioDeck } from '../deck';
import type { PlayerSnapshot, RadioPlayer } from '../player/RadioPlayer';
import { PlayMorph } from './PlayMorph';

export interface TransportBarProps {
  readonly deck: RadioDeck;
  readonly player: RadioPlayer;
  readonly snapshot: PlayerSnapshot;
  /** The disc a press of play puts in when the player is empty: the first on the shelf. */
  readonly firstDisc: string | null;
  readonly onLeave: () => void;
}

/** A landscape phone has no height to spare: the bar becomes a rail down the right edge. */
export const RAIL_QUERY = '(orientation: landscape) and (max-height: 479.98px)';

/** The play button's radius, px (`--radio-play` is its diameter), and the title's gap from its rim to the baseline. */
const PLAY_RADIUS = 40;
const TITLE_GAP = 15;
/**
 * The title's baseline: a gentle arc over the button, centred over it, its top `TITLE_GAP` above the rim. A radius
 * well beyond the button's keeps the curve flat, so the words bow over the button rather than wrap round it.
 */
const TITLE_RADIUS = 118;
/** How far either way of the top the baseline runs, radians: room for the words with some to spare. */
const TITLE_SPAN = 1.05;
/** The title's box, centred on the button: the arc's circle plus the letters standing on it. */
const TITLE_BOX = (TITLE_RADIUS + 30) * 2;

/**
 * The radio's controls for fingers (round six, item 35): the 3D keys are too small to tap on a phone, so a primary
 * touch screen gets one large play/pause button at the foot of the screen, on the mute button's round dark glass,
 * its glyph turning over the way the mute button's does, under the shelf's title curved round its top; and the way
 * back to the room, a pill in the room UI's style at the top left, in the mute button's row and of its height (on a
 * landscape phone both go down a right rail). No skip keys: the discs are picked from the shelf, and a disc
 * that ends puts the next one in. Play on an empty player puts the first disc in. The key stands on its own: what
 * plays is in its name, for screen readers, not written beside it. It tells the room how much of the viewport it
 * covers, so the room frames the radio clear of it.
 */
export function TransportBar({ deck, player, snapshot, firstDisc, onLeave }: TransportBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const rail = useMediaQuery(RAIL_QUERY);
  const reduced = useMediaQuery(REDUCED_MOTION);
  const [active, setActive] = useState(1);

  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const back = buttons.current[0];
    const report = (): void => {
      const { width, height } = element.getBoundingClientRect();
      // Upright, the way back sits in the top row: the shelf hangs below it.
      const top = rail || !back ? 0 : back.getBoundingClientRect().bottom + 8;
      deck.setControlInsets({ top, left: 0, right: rail ? width : 0, bottom: rail ? 0 : height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    if (back) observer.observe(back);
    return () => {
      observer.disconnect();
      deck.setControlInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    };
  }, [deck, rail]);

  const playing = snapshot.transport === 'playing' && snapshot.disc !== null;
  const playPause = (): void => {
    if (snapshot.disc === null) {
      if (firstDisc !== null) player.pick(firstDisc);
    } else player.press('play-pause');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = nextRovingIndex(event.key, active, 2);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  };

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="CD player controls"
      className={rail ? 'radio-bar radio-bar--rail' : 'radio-bar radio-bar--bottom'}
      onKeyDown={onKeyDown}
    >
      <button
        ref={(element) => {
          buttons.current[0] = element;
        }}
        type="button"
        className="radio-bar__back"
        aria-label={rail ? 'Back to the room' : undefined}
        tabIndex={active === 0 ? 0 : -1}
        onFocus={() => setActive(0)}
        onClick={onLeave}
      >
        <svg className="radio-bar__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19 12H5.5M11 5.5 4.5 12l6.5 6.5" />
        </svg>
        {rail ? null : <span className="radio-bar__back-title">Back to the room</span>}
      </button>
      <div className="radio-bar__deck">
        {rail ? null : <ShelfTitle shown={!playing} />}
        <button
          ref={(element) => {
            buttons.current[1] = element;
          }}
          type="button"
          className="radio-bar__play"
          aria-label={playLabel(playing, snapshot)}
          data-playing={playing}
          tabIndex={active === 1 ? 0 : -1}
          onFocus={() => setActive(1)}
          onClick={playPause}
        >
          <PlayMorph playing={playing} reduced={reduced} />
        </button>
      </div>
    </div>
  );
}

/**
 * "Some songs I made" in Chewy, set on a curve over the play button like the label round a badge (round six, item 35,
 * flattened and given more room in round seven): an SVG `<textPath>` on a gentle arc centred over the button, so it
 * stays crisp at every size. Shown while nothing plays, springing in and out from the button's centre with its own
 * spring. The words are also a real heading for a screen reader.
 */
function ShelfTitle({ shown }: { readonly shown: boolean }) {
  const id = useId();
  // The button's centre is the box's; the arc's own centre sits below it, so its top is just over the rim.
  const centre = TITLE_BOX / 2;
  const arcY = centre - PLAY_RADIUS - TITLE_GAP + TITLE_RADIUS;
  const dx = TITLE_RADIUS * Math.sin(TITLE_SPAN);
  const y = arcY - TITLE_RADIUS * Math.cos(TITLE_SPAN);
  const arc = `M ${(centre - dx).toFixed(2)} ${y.toFixed(2)} A ${TITLE_RADIUS} ${TITLE_RADIUS} 0 0 1 ${(centre + dx).toFixed(2)} ${y.toFixed(2)}`;
  return (
    <>
      <h2 className="radio__hidden">Some songs I made</h2>
      <svg
        className="radio-bar__title"
        data-shown={shown}
        viewBox={`0 0 ${TITLE_BOX} ${TITLE_BOX}`}
        width={TITLE_BOX}
        height={TITLE_BOX}
        aria-hidden="true"
        focusable="false"
      >
        <path id={id} d={arc} fill="none" />
        <text>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
            Some songs I made
          </textPath>
        </text>
      </svg>
    </>
  );
}

/**
 * The key's name says what it does and, once a disc is in, to which song: "Pause It's all in your head, by Roel
 * Leenders ft. Bram Reker". Nothing about the song is written beside the key (round eight, item 45).
 */
function playLabel(playing: boolean, snapshot: PlayerSnapshot): string {
  const action = playing ? 'Pause' : 'Play';
  const { album, trackTitle } = snapshot;
  return album && trackTitle ? `${action} ${trackTitle}, by ${album.artist}` : action;
}
