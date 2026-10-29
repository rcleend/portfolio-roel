import './SoundToggle.css';

export interface SoundToggleProps {
  readonly muted: boolean;
  onToggle(): void;
}

/**
 * The speaker in the top-right corner, in the room UI's white line style. A real toggle button (`aria-pressed` =
 * muted) reachable with Tab; a mouse click does not take focus from the game, so play continues with the keyboard
 * right after. Turning the sound on sends the waves out again; muting swaps them for a cross.
 */
export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label="Mute sound"
      aria-pressed={muted}
      title={muted ? 'Sound off' : 'Sound on'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="sound-toggle__speaker"
          d="M3.5 10a1.4 1.4 0 0 1 1.4-1.4h2.4l3.9-3.4c.8-.7 1.9-.1 1.9.9v11.8c0 1-1.1 1.6-1.9.9l-3.9-3.4H4.9A1.4 1.4 0 0 1 3.5 14z"
        />
        <path className="sound-toggle__wave" d="M15.8 9.4a3.8 3.8 0 0 1 0 5.2" />
        <path className="sound-toggle__wave" d="M18.4 6.9a7.4 7.4 0 0 1 0 10.2" />
        <path className="sound-toggle__cross" d="m16.4 9.8 4.4 4.4m0-4.4-4.4 4.4" />
      </svg>
    </button>
  );
}
