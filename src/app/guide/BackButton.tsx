import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface BackButtonProps {
  /** The camera rests at the computer or the radio. */
  readonly due: boolean;
  /** Flies back to the room view, as a click beside the computer or the radio does. */
  readonly onBack: () => void;
}

/** The camera lands first; a beat later the way back rises under it. */
const LANDED_DELAY_MS = 450;

/** True a beat after `due` turns true (at once when `delayed` is false); false the moment it turns false. */
function useShown(due: boolean, delayed: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!due) return;
    if (!delayed) {
      setShown(true);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), LANDED_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [due, delayed]);
  return shown;
}

function BackArrow() {
  return (
    <svg className="guide-icon back-button__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 12H5.5M11 5.5 4.5 12l6.5 6.5" />
    </svg>
  );
}

/**
 * The way back to the room from the computer and the radio (docs/ART-DIRECTION.md › The room's UI): one pill along
 * the bottom, a line arrow and "Back to the room" in Chewy, with the Escape key it shares for mouse and keyboard
 * users. A real button, after the computer's screen or the radio's controls in tab order; hidden (and out of the tab
 * order) while the camera is anywhere else.
 */
export function BackButton({ due, onBack }: BackButtonProps) {
  const shown = useShown(due, true);
  return (
    <button
      type="button"
      className="back-button guide-pill"
      data-shown={shown}
      aria-keyshortcuts="Escape"
      tabIndex={shown ? 0 : -1}
      onClick={onBack}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onBack();
      }}
    >
      <BackArrow />
      <span className="guide-pill__title">Back to the room</span>
      <span className="back-button__key" aria-hidden="true">
        Esc
      </span>
    </button>
  );
}

export interface TvWayOutProps {
  /** The visitor has begun (pressed past the title) and the camera rests on the TV. */
  readonly due: boolean;
  /** The visitor has been in the room on this visit: it says "Back to the room", and rises a beat after landing. */
  readonly returning: boolean;
  /** Flies to the room view, as a click beside the TV does with a mouse (on a touch screen a tap above the set). */
  readonly onLookAround: () => void;
  readonly touch: boolean;
  /** Set when the host's way out had the keyboard as this took its place: this button takes the focus (RoomHost.tsx). */
  readonly handOver: RefObject<boolean>;
}

/**
 * The TV view's way out (docs/ART-DIRECTION.md › The room's UI): the way back's pill without its key (Escape belongs
 * to the game's menus here). "Explore the room" until the visitor has been in the room on this visit, "Back to the
 * room" after; it appears the moment the first press begins the game, and on every later return to the TV a beat
 * after the camera lands. On a touch screen it sits where the radio's own "Back to the room" does. Always a button,
 * first after the stage in tab order: unseen until it is shown, or until the keyboard finds it.
 */
export function TvWayOut({ due, returning, onLookAround, touch, handOver }: TvWayOutProps) {
  const shown = useShown(due, returning);
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!handOver.current) return;
    handOver.current = false;
    button.current?.focus({ preventScroll: true });
  }, [handOver]);
  const label = returning ? 'Back to the room' : 'Explore the room';
  return (
    <button
      ref={button}
      type="button"
      className="back-button tv-way-out guide-pill"
      data-shown={shown}
      data-touch={touch}
      aria-label={label}
      onClick={onLookAround}
    >
      <BackArrow />
      <span className="guide-pill__title tv-way-out__title">{label}</span>
    </button>
  );
}
