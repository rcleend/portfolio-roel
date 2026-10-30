import { useEffect, useState } from 'react';

export interface BackButtonProps {
  /** The camera rests at the computer or the radio. */
  readonly due: boolean;
  /** Flies back to the room view, as a click beside the computer or the radio does. */
  readonly onBack: () => void;
}

/** The camera lands first; a beat later the way back rises under it. */
const LANDED_DELAY_MS = 450;

/**
 * The way back to the room from the computer and the radio (docs/ART-DIRECTION.md › The room's UI): one pill along
 * the bottom, a line arrow and "Back to the room" in Chewy, with the Escape key it shares for mouse and keyboard
 * users. A real button, after the computer's screen or the radio's controls in tab order; hidden (and out of the tab
 * order) while the camera is anywhere else.
 */
export function BackButton({ due, onBack }: BackButtonProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!due) return;
    const timer = window.setTimeout(() => setShown(true), LANDED_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [due]);
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
      <svg className="guide-icon back-button__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19 12H5.5M11 5.5 4.5 12l6.5 6.5" />
      </svg>
      <span className="guide-pill__title">Back to the room</span>
      <span className="back-button__key" aria-hidden="true">
        Esc
      </span>
    </button>
  );
}
