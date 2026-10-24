import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RoomView } from '@/room';
import type { PcDisplay } from './display';
import type { PcExperienceProps } from './PcExperience';
import { whenIdle } from './whenIdle';
import './PcSlot.css';

export interface PcSlotProps {
  /** The room's monitor once the room is ready, else null. */
  readonly display: PcDisplay | null;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  /** The camera rests at `view`: the screen's idle prefetch never lands in a flight. */
  readonly settled: boolean;
  /** True once the TV's picture is up: idle prefetch may begin (never while the TV turns on). */
  readonly powered: boolean;
  /** Leave the computer for the room view (close button, Escape in the screen, after the 200 ms beat). */
  readonly onLeave: () => void;
  /** Hand keyboard focus back to the stage (the screen lost focus because it was hidden). */
  readonly onFocusStage: () => void;
}

type Experience = ComponentType<PcExperienceProps>;

let experience: Promise<Experience> | null = null;

/**
 * Loads the screen once per page load. A failed load stays failed: browsers keep a dynamic
 * import's failure in their module map, so asking again would fail without even a request.
 */
function loadExperience(): Promise<Experience> {
  experience ??= import('./PcExperience').then((module) => module.PcExperience);
  return experience;
}

/**
 * The computer's screen, as the room host mounts it: nothing on first load
 * but this glue. The desktop's still painter loads at idle once the TV is
 * on (the room paints the glass with it before the first flight); the screen
 * itself loads at idle once the camera has landed in the room view, or at
 * once on the way to the computer, while the camera's flight hides the
 * download. Renders portals only.
 */
export function PcSlot({ display, view, settled, powered, onLeave, onFocusStage }: PcSlotProps): ReactNode {
  const [Screen, setScreen] = useState<Experience | 'failed' | null>(null);

  useEffect(() => {
    if (!display || !powered) return;
    // Even with Save-Data: a few kB that keep the monitor from showing a dead tube.
    return whenIdle(() => {
      import('./still/pcStill').then((still) => display.setStill(still.paintDesktop), warn);
    });
  }, [display, powered]);

  // Loaded, or failed for good.
  const settledLoad = Screen !== null;
  const wanted = view === 'pc' || (view === 'room' && settled && !saveData());
  useEffect(() => {
    if (!display || settledLoad || !wanted) return;
    // A load finishing after this effect is gone still lands: the screen stays mounted once loaded.
    const load = (): void => {
      loadExperience().then(
        (component) => setScreen(() => component),
        (error: unknown) => {
          warn(error);
          setScreen('failed');
        },
      );
    };
    // On the way to the computer: now, hidden by the flight. Looking around the room: when the page is idle.
    if (view !== 'pc') return whenIdle(load);
    load();
  }, [display, settledLoad, wanted, view]);

  if (!display || !Screen) return null;
  const leave = (): void => {
    onLeave();
    onFocusStage();
  };
  return createPortal(
    Screen === 'failed' ? (
      <Unavailable onLeave={leave} />
    ) : (
      <Screen display={display} onLeave={onLeave} onFocusStage={onFocusStage} />
    ),
    display.screen,
  );
}

/**
 * The screen could not load: say so in the screen's own idiom and point to the résumé on the page. A click outside
 * the computer leaves (the room's), and so does Escape, from the stage or from in here (its link, or the box itself,
 * which a click focuses).
 */
function Unavailable({ onLeave }: { readonly onLeave: () => void }) {
  return (
    <div
      className="pc-unavailable"
      role="alert"
      // A click in the box keeps the keys, and so Escape, here.
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onLeave();
      }}
    >
      <p>
        The document could not be opened. <a href="#resume">Read the résumé</a>
      </p>
    </div>
  );
}

function warn(error: unknown): void {
  console.warn('The PC screen failed to load', error);
}

function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
