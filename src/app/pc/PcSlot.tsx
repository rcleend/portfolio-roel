import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PcDisplay, PcView } from './display';
import type { PcExperienceProps } from './PcExperience';
import { whenIdle } from './whenIdle';
import './PcSlot.css';

export interface PcSlotProps {
  /** The room's monitor once the room is ready, else null. */
  readonly display: PcDisplay | null;
  /** The view the camera is at or flying to. */
  readonly view: PcView;
  /** True once the TV is powering on: idle prefetch may begin. */
  readonly powered: boolean;
  /** Leave the computer for the room view (close button, Escape in the screen, after the 200 ms beat). */
  readonly onLeave: () => void;
  /** Hand keyboard focus back to the stage (the screen lost focus because it was hidden). */
  readonly onFocusStage: () => void;
}

type Experience = ComponentType<PcExperienceProps>;

let experience: Promise<Experience> | null = null;

function loadExperience(): Promise<Experience> {
  experience ??= import('./PcExperience').then(
    (module) => module.PcExperience,
    (error: unknown) => {
      experience = null; // The next visit to the computer tries again.
      throw error;
    },
  );
  return experience;
}

/**
 * The computer's screen, as the room host mounts it: nothing on first load
 * but this glue. The desktop's still painter loads at idle once the TV is
 * on (the room paints the glass with it before the first flight); the screen
 * itself loads at idle the first time the visitor looks around the room, or
 * at once on the way to the computer, while the camera's flight hides the
 * download. Renders portals only.
 */
export function PcSlot({ display, view, powered, onLeave, onFocusStage }: PcSlotProps): ReactNode {
  const [Screen, setScreen] = useState<Experience | 'failed' | null>(null);

  useEffect(() => {
    if (!display || !powered) return;
    // Even with Save-Data: a few kB that keep the monitor from showing a dead tube.
    return whenIdle(() => {
      import('./still/pcStill').then(({ paintDesktop }) => display.setStill(paintDesktop), warn);
    });
  }, [display, powered]);

  const loaded = typeof Screen === 'function';
  const wanted = view === 'pc' || (view === 'room' && !saveData());
  useEffect(() => {
    if (!display || loaded || !wanted) return;
    let current = true;
    const load = (): void => {
      loadExperience().then(
        (component) => current && setScreen(() => component),
        (error: unknown) => {
          warn(error);
          if (current) setScreen('failed');
        },
      );
    };
    // On the way to the computer: now, hidden by the flight. Looking around the room: when the page is idle.
    const cancel = view === 'pc' ? null : whenIdle(load);
    if (!cancel) load();
    return () => {
      current = false;
      cancel?.();
    };
  }, [display, loaded, wanted, view]);

  if (!display || !Screen) return null;
  return createPortal(
    Screen === 'failed' ? <Unavailable /> : <Screen display={display} onLeave={onLeave} onFocusStage={onFocusStage} />,
    display.screen,
  );
}

/**
 * The screen could not load: say so in the screen's own idiom and point to the résumé on the page. Escape and
 * clicks outside the computer still leave (the room handles both).
 */
function Unavailable() {
  return (
    <div className="pc-unavailable" role="alert">
      <p>The document could not be opened.</p>
      <a href="#resume">Read the résumé</a>
    </div>
  );
}

function warn(error: unknown): void {
  console.warn('The computer’s screen failed to load', error);
}

function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
