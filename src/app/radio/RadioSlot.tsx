import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveData, whenIdle } from '../pc/whenIdle';
import type { RadioDeck, RadioDoor, RoomView } from './deck';
import type { RadioExperienceProps } from './RadioExperience';
import './RadioSlot.css';

export interface RadioSlotProps {
  /** The room's CD player (its deck loads lazily); the slot mounts once the room is ready. */
  readonly door: RadioDoor;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  /** The camera rests at `view`: the player's idle prefetch and first mount never land in a flight. */
  readonly settled: boolean;
  /** True once the TV's picture is up: nothing radio-related happens before. */
  readonly powered: boolean;
  /** The camera is about to set off for the radio and waits a moment for the player (RoomHost): it loads now. */
  readonly boarding: boolean;
  /** The player is mounted, its layout done: a camera waiting for it may leave. Stable across renders. */
  readonly onMounted: () => void;
  /** The site's sound preference (the sound toggle). */
  readonly muted: boolean;
  /** Leave the radio for the room view (Escape in the controls, the bar's back button). */
  readonly onLeave: () => void;
  /** Hand keyboard focus back to the stage (the controls lost focus because they were hidden). */
  readonly onFocusStage: () => void;
}

type Experience = ComponentType<RadioExperienceProps>;

/** The player's chunk (or its failure) and the room's deck it drives, both loaded. */
interface Loaded {
  readonly Player: Experience | 'failed';
  readonly deck: RadioDeck;
}

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
 * load but this glue. The player loads as the camera is about to set off for the radio
 * (the camera waits a bounded moment for it: `RadioDoor.onBoarding`), or at idle once the
 * visitor has been looking around the room for a moment, when the room starts preparing
 * its half too. It first mounts (and paints the discs' prints) only while the camera
 * rests, so no flight ever pays for it. Once mounted it stays for the page, so the music plays on wherever
 * the visitor goes. Renders a portal into the room's controls slot only.
 */
export function RadioSlot({
  door,
  view,
  settled,
  powered,
  boarding,
  onMounted,
  muted,
  onLeave,
  onFocusStage,
}: RadioSlotProps): ReactNode {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mounted, setMounted] = useState(false);

  // Looking around the room for a while: both halves at idle, the room's first; never on Save-Data, never for a
  // radio that cannot work (it is scenery).
  const lookingAround = door.available && view === 'room' && settled && powered && !saveData();

  useEffect(() => {
    if (!lookingAround) return;
    return afterIdleDelay(DEVICE_PREFETCH_AFTER_SETTLED_MS, () => door.prefetch('idle'));
  }, [door, lookingAround]);

  useEffect(() => {
    if (!door.available || loaded) return;
    // About to set off for the radio (the camera waits a moment for this), or on the way there: now.
    if (view === 'radio' || boarding) return load(door, setLoaded);
    if (!lookingAround) return;
    return afterIdleDelay(PLAYER_PREFETCH_AFTER_SETTLED_MS, () => door.available && load(door, setLoaded));
  }, [door, view, boarding, lookingAround, loaded]);

  // Mounting (the player, its controls, the prints) is never a flight's work (docs/ROOM.md › Flights): it waits for
  // the camera to rest. On the way to the radio that is before the camera sets off, which waits for it; a player
  // whose code comes later than that wait allows mounts at the landing.
  const mountable = loaded !== null && settled;
  useEffect(() => {
    if (mountable) setMounted(true);
  }, [mountable]);

  const shown = loaded !== null && (mounted || mountable);
  useEffect(() => {
    if (!shown || !loaded) return;
    // Its style and layout now, while the camera rests, rather than in the first frame it moves in.
    void loaded.deck.controls.offsetHeight;
    onMounted();
  }, [shown, loaded, onMounted]);

  if (!loaded || !shown) return null;
  const { Player, deck } = loaded;
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

/**
 * The player's chunk and the room's deck side by side. A load finishing after the effect that asked is gone still
 * lands: the player stays once loaded. A radio that cannot work has nothing to mount (it is scenery).
 */
function load(door: RadioDoor, setLoaded: (loaded: Loaded) => void): void {
  const player = loadExperience().catch((error: unknown): 'failed' => {
    console.warn('The CD player failed to load', error);
    return 'failed';
  });
  Promise.all([player, door.load()]).then(([Player, deck]) => setLoaded({ Player, deck }), ignore);
}

function ignore(): void {}
