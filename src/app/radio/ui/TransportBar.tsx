import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { nextRovingIndex } from '../../a11y/roving';
import { useMediaQuery } from '../../useMediaQuery';
import type { RadioDeck } from '../deck';
import type { PlayerSnapshot, RadioPlayer } from '../player/RadioPlayer';

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
const TITLE_GAP = 7;
/** The title's baseline: an arc over the top of the button, concentric with it, drawn left to right. */
const TITLE_RADIUS = PLAY_RADIUS + TITLE_GAP;
/** The title's box: the arc plus the letters standing on it. */
const TITLE_BOX = (TITLE_RADIUS + 22) * 2;

const PLAY = 'M8.6 5.6v12.8l10.2-6.4z';
const PAUSE = 'M7 5.8h3.4v12.4H7zM13.6 5.8H17v12.4h-3.4z';

/**
 * The radio's controls for fingers (round six, item 35): the 3D keys are too small to tap on a phone, so a primary
 * touch screen gets one large play/pause button at the foot of the screen, on the mute button's round dark glass,
 * its glyph turning over the way the mute button's does, under the shelf's title curved round its top; and the way
 * back to the room, a pill in the room UI's style at the top left, in the mute button's row and of its height (on a
 * landscape phone both go down a right rail). No skip keys: the discs are picked from the shelf, and a disc
 * that ends puts the next one in. Play on an empty player puts the first disc in. While nothing plays, what is in
 * the player is named beside it. It tells the room how much of the viewport it covers, so the room frames the radio
 * clear of it.
 */
export function TransportBar({ deck, player, snapshot, firstDisc, onLeave }: TransportBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const rail = useMediaQuery(RAIL_QUERY);
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
          aria-label={playing ? 'Pause' : 'Play'}
          data-playing={playing}
          tabIndex={active === 1 ? 0 : -1}
          onFocus={() => setActive(1)}
          onClick={playPause}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path className="radio-bar__glyph radio-bar__glyph--play" d={PLAY} />
            <path className="radio-bar__glyph radio-bar__glyph--pause" d={PAUSE} />
          </svg>
        </button>
      </div>
      {rail ? null : (
        <p className="radio-bar__now" aria-hidden="true" data-shown={!playing && snapshot.album !== null}>
          {snapshot.album && snapshot.trackTitle ? (
            <>
              <span className="radio-bar__track">{snapshot.trackTitle}</span>
              <span className="radio-bar__album">
                {snapshot.album.artist}
                {snapshot.album.year === undefined ? '' : ` · ${snapshot.album.year}`}
              </span>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

/**
 * "Some songs I made" in Chewy, set on a curve round the top of the play button like the label round a badge (round
 * six, item 35 and the captain's refinement): an SVG `<textPath>` on an arc concentric with the button, centred over
 * it, so it stays crisp at every size. Shown while nothing plays, popping in and out with the button's spring. The
 * words are also a real heading for a screen reader.
 */
function ShelfTitle({ shown }: { readonly shown: boolean }) {
  const id = useId();
  const centre = TITLE_BOX / 2;
  const arc = `M ${centre - TITLE_RADIUS} ${centre} A ${TITLE_RADIUS} ${TITLE_RADIUS} 0 0 1 ${centre + TITLE_RADIUS} ${centre}`;
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
