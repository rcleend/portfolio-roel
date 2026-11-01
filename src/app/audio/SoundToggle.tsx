import { useRef } from 'react';
import { jelly } from '../motion/jelly';
import './SoundToggle.css';

export interface SoundToggleProps {
  readonly muted: boolean;
  onToggle(): void;
}

/**
 * The speaker in the top-right corner, in the room UI's white line style, named for what it does next: "unmute me"
 * while muted, "mute me" while the sound is on, the words written beside the speaker for mice (a touch screen shows the
 * speaker alone, its name for screen readers). A real button reachable with Tab; a mouse click does not take focus
 * from the game, so play continues with the keyboard right after. Turning the sound on sends the waves out again; muting swaps them for a cross; the speaker wobbles like
 * jelly either way, and the button squashes under the press and springs back, like the radio's play key.
 */
export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  const glyph = useRef<SVGSVGElement>(null);
  const label = muted ? 'Unmute me' : 'Mute me';
  return (
    <button
      type="button"
      className="sound-toggle"
      data-muted={muted}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onToggle();
        // The radio's play key's pair: the speaker wobbles as its waves and cross change.
        jelly(glyph.current);
      }}
    >
      <svg ref={glyph} viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="sound-toggle__speaker"
          d="M3.5 10a1.4 1.4 0 0 1 1.4-1.4h2.4l3.9-3.4c.8-.7 1.9-.1 1.9.9v11.8c0 1-1.1 1.6-1.9.9l-3.9-3.4H4.9A1.4 1.4 0 0 1 3.5 14z"
        />
        <path className="sound-toggle__wave" d="M15.8 9.4a3.8 3.8 0 0 1 0 5.2" />
        <path className="sound-toggle__wave" d="M18.4 6.9a7.4 7.4 0 0 1 0 10.2" />
        <path className="sound-toggle__cross" d="m16.4 9.8 4.4 4.4m0-4.4-4.4 4.4" />
      </svg>
      <span className="sound-toggle__label" aria-hidden="true">
        {muted ? 'unmute me' : 'mute me'}
      </span>
    </button>
  );
}
