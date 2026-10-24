import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { nextRovingIndex } from '../../a11y/roving';
import { useMediaQuery } from '../../useMediaQuery';
import type { RadioDeck, RadioKey } from '../deck';
import type { PlayerSnapshot, RadioPlayer } from '../player/RadioPlayer';
import { type Glyph, GlyphIcon } from './icons';

export interface TransportBarProps {
  readonly deck: RadioDeck;
  readonly player: RadioPlayer;
  readonly snapshot: PlayerSnapshot;
  readonly onLeave: () => void;
}

/** A landscape phone has no height to spare: the bar becomes a rail down the right edge. */
export const RAIL_QUERY = '(orientation: landscape) and (max-height: 479.98px)';

interface BarButton {
  readonly key: RadioKey | 'back';
  readonly glyph: Glyph;
  readonly label: string;
}

/**
 * The radio's keys for fingers (SPEC §3.10, §8.7): the 3D keys are too small to tap on a
 * phone, so a primary touch screen gets a bar of 48 px buttons along the bottom (or a
 * rail down the right edge on a landscape phone), with a way back to the room. Each key
 * also presses its 3D twin, so the model still answers. It tells the room how much of the
 * viewport it covers, and the room frames the radio clear of it.
 */
export function TransportBar({ deck, player, snapshot, onLeave }: TransportBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const rail = useMediaQuery(RAIL_QUERY);
  const [active, setActive] = useState(2);

  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const report = (): void => {
      const { width, height } = element.getBoundingClientRect();
      deck.setControlInsets({ top: 0, left: 0, right: rail ? width : 0, bottom: rail ? 0 : height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
      deck.setControlInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    };
  }, [deck, rail]);

  const playing = snapshot.transport === 'playing' && snapshot.disc !== null;
  const empty = snapshot.disc === null;
  const items: readonly BarButton[] = [
    { key: 'back', glyph: 'back', label: 'Look around the room' },
    { key: 'previous', glyph: 'previous', label: 'Previous track' },
    { key: 'play-pause', glyph: playing ? 'pause' : 'play', label: playing ? 'Pause' : 'Play' },
    { key: 'stop', glyph: 'stop', label: 'Stop' },
    { key: 'next', glyph: 'next', label: 'Next track' },
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = nextRovingIndex(event.key, active, items.length);
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
      {items.map(({ key, glyph, label }, index) => (
        <button
          key={key}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          className={key === 'back' ? 'radio-bar__button radio-bar__button--back' : 'radio-bar__button'}
          aria-label={label}
          aria-disabled={empty && key !== 'back' ? 'true' : undefined}
          tabIndex={index === active ? 0 : -1}
          onFocus={() => setActive(index)}
          onClick={() => (key === 'back' ? onLeave() : player.press(key))}
        >
          <GlyphIcon glyph={glyph} />
        </button>
      ))}
      {rail ? null : (
        <p className="radio-bar__now" aria-hidden="true">
          {snapshot.album && snapshot.trackTitle ? `${snapshot.trackTitle} · ${snapshot.album.title}` : ''}
        </p>
      )}
    </div>
  );
}
