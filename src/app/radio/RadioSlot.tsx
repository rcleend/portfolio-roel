import { type ComponentType, type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { whenIdle } from '../pc/whenIdle';
import type { RadioDeck, RadioView } from './deck';
import type { RadioExperienceProps } from './RadioExperience';
import './RadioSlot.css';

export interface RadioSlotProps {
  /** The room's CD player once the room is ready, else null. */
  readonly deck: RadioDeck | null;
  /** The view the camera is at or flying to. */
  readonly view: RadioView;
  /** True once the TV's picture is up: nothing radio-related happens before. */
  readonly powered: boolean;
  /** The site's sound preference (the sound toggle). */
  readonly muted: boolean;
  /** Leave the radio for the room view (Escape in the controls, the bar's back button). */
  readonly onLeave: () => void;
  /** Hand keyboard focus back to the stage (the controls lost focus because they were hidden). */
  readonly onFocusStage: () => void;
}

type Experience = ComponentType<RadioExperienceProps>;

/** The 1.1 s flight to the room plus 1.5 s settled there: the visitor is looking around, not passing through. */
export const PREFETCH_AFTER_ROOM_MS = 2600;

let experience: Promise<Experience> | null = null;

/** Loads the player once per page load; a failed load stays failed (the browser keeps the import's failure). */
function loadExperience(): Promise<Experience> {
  experience ??= import('./RadioExperience').then((module) => module.RadioExperience);
  return experience;
}

/**
 * The CD player as the room host mounts it (docs/RADIO.md › Loading): nothing on first
 * load but this glue. The player loads at once on the way to the radio, hidden by the
 * flight, or at idle once the visitor has been looking around the room for a moment, when
 * the room starts preparing its half too. Once loaded it stays mounted for the page, so
 * the music plays on wherever the visitor goes. Renders a portal into the room's controls
 * slot only.
 */
export function RadioSlot({ deck, view, powered, muted, onLeave, onFocusStage }: RadioSlotProps): ReactNode {
  const [Player, setPlayer] = useState<Experience | 'failed' | null>(null);

  useEffect(() => {
    // A radio that cannot work is scenery: nothing of the player loads for it.
    if (!deck?.available || Player) return;
    // On the way to the radio: now, hidden by the flight.
    if (view === 'radio') {
      load(setPlayer);
      return;
    }
    // Looking around the room for a while: both halves at idle, never on Save-Data.
    if (view !== 'room' || !powered || saveData()) return;
    let cancelIdle: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      cancelIdle = whenIdle(() => {
        if (!deck.available) return;
        deck.prefetch('idle');
        load(setPlayer);
      });
    }, PREFETCH_AFTER_ROOM_MS);
    return () => {
      window.clearTimeout(timer);
      cancelIdle?.();
    };
  }, [deck, powered, view, Player]);

  if (!deck || !Player) return null;
  return createPortal(
    Player === 'failed' ? (
      <p className="radio-unavailable" role="alert">
        The CD player could not load its music.
      </p>
    ) : (
      <Player deck={deck} view={view} muted={muted} onLeave={onLeave} onFocusStage={onFocusStage} />
    ),
    deck.controls,
  );
}

/** A load finishing after the effect that asked is gone still lands: the player stays once loaded. */
function load(setPlayer: Dispatch<SetStateAction<Experience | 'failed' | null>>): void {
  loadExperience().then(
    (component) => setPlayer(() => component),
    (error: unknown) => {
      console.warn('The CD player failed to load', error);
      setPlayer('failed');
    },
  );
}

function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
