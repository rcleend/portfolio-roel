import { type ComponentType, type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { whenIdle } from '../pc/whenIdle';
import type { RadioDeck, RoomView } from './deck';
import type { RadioExperienceProps } from './RadioExperience';
import './RadioSlot.css';

export interface RadioSlotProps {
  /** The room's CD player once the room is ready, else null. */
  readonly deck: RadioDeck | null;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  /** The camera rests at `view`: the player's idle prefetch and first mount never land in a flight. */
  readonly settled: boolean;
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

/**
 * Settled in the room view this long, the visitor is looking around rather than passing through. The computer's
 * screen loads first, as the camera lands. Then, almost at once, the room's half of the radio (its device and the
 * close-up, prepared in the room's own idle units, never in a flight but on the way to the radio), so a visitor who
 * heads for the radio straight away still sees the radio wake, the lid open on time and the discs rise.
 */
export const DEVICE_PREFETCH_AFTER_SETTLED_MS = 400;

/**
 * Then the player, whose chunk and prints are the bigger main-thread job: by now a visitor heading for the computer
 * has clicked, so it rarely lands in that flight (a player loaded at idle mounts only while the camera rests).
 */
export const PLAYER_PREFETCH_AFTER_SETTLED_MS = 3000;

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
 * the room starts preparing its half too. A player loaded at idle first mounts (and paints
 * the discs' prints) only while the camera rests, so a flight that sets off meanwhile
 * never pays for it. Once mounted it stays for the page, so the music plays on wherever
 * the visitor goes. Renders a portal into the room's controls slot only.
 */
export function RadioSlot({ deck, view, settled, powered, muted, onLeave, onFocusStage }: RadioSlotProps): ReactNode {
  const [Player, setPlayer] = useState<Experience | 'failed' | null>(null);
  const [mounted, setMounted] = useState(false);

  // Looking around the room for a while: both halves at idle, the room's first; never on Save-Data, never for a
  // radio that cannot work (it is scenery).
  const lookingAround = deck?.available === true && view === 'room' && settled && powered && !saveData();

  useEffect(() => {
    if (!deck || !lookingAround) return;
    return afterIdleDelay(DEVICE_PREFETCH_AFTER_SETTLED_MS, () => {
      if (deck.available) deck.prefetch('idle');
    });
  }, [deck, lookingAround]);

  useEffect(() => {
    if (!deck?.available || Player) return;
    // On the way to the radio: now, hidden by the flight.
    if (view === 'radio') {
      load(setPlayer);
      return;
    }
    if (!lookingAround) return;
    return afterIdleDelay(PLAYER_PREFETCH_AFTER_SETTLED_MS, () => {
      if (deck.available) load(setPlayer);
    });
  }, [deck, view, lookingAround, Player]);

  // Mounting (the player, its controls, the prints) waits for the camera to rest, except on the way to the radio,
  // where the flight hides it and the discs want their prints before they rise.
  const mountable = Player !== null && (settled || view === 'radio');
  useEffect(() => {
    if (mountable) setMounted(true);
  }, [mountable]);

  if (!deck || !Player || !(mounted || mountable)) return null;
  return createPortal(
    Player === 'failed' ? (
      // The slot is hidden until the camera lands at the radio, and an alert filled while hidden is never read out: the
      // live region is there from the start and its words arrive with the landing.
      <p className="radio-unavailable" role="alert">
        {view === 'radio' && settled ? 'The CD player could not load its music.' : null}
      </p>
    ) : (
      <Player deck={deck} view={view} settled={settled} muted={muted} onLeave={onLeave} onFocusStage={onFocusStage} />
    ),
    deck.controls,
  );
}

/** Runs `task` at the first idle moment `ms` from now; returns a cancel function. */
function afterIdleDelay(ms: number, task: () => void): () => void {
  let cancelIdle: (() => void) | undefined;
  const timer = window.setTimeout(() => {
    cancelIdle = whenIdle(task);
  }, ms);
  return () => {
    window.clearTimeout(timer);
    cancelIdle?.();
  };
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
