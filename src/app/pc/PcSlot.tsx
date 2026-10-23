import { type ComponentType, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
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
type Loaded =
  | { readonly state: 'idle' }
  | { readonly state: 'loaded'; readonly Experience: Experience }
  | { readonly state: 'failed' };

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
  const [loaded, setLoaded] = useState<Loaded>({ state: 'idle' });

  useEffect(() => {
    if (!display || !powered) return;
    let cancelled = false;
    // Even with Save-Data: a few kB that keep the monitor from showing a dead tube.
    const cancel = whenIdle(() => {
      import('./still/pcStill').then(
        ({ paintDesktop }) => {
          if (!cancelled) display.setStill(paintDesktop);
        },
        (error: unknown) => console.warn('The computer’s desktop failed to load', error),
      );
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [display, powered]);

  const state = loaded.state;
  useEffect(() => {
    if (!display || state === 'loaded' || view === 'tv' || (view === 'room' && saveData())) return;
    let cancelled = false;
    const load = (): void => {
      loadExperience().then(
        (Experience) => {
          if (!cancelled) setLoaded({ state: 'loaded', Experience });
        },
        (error: unknown) => {
          console.warn('The computer’s screen failed to load', error);
          if (!cancelled) setLoaded({ state: 'failed' });
        },
      );
    };
    if (view === 'pc') {
      load();
      return () => {
        cancelled = true;
      };
    }
    const cancel = whenIdle(load);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [display, view, state]);

  if (!display) return null;
  if (loaded.state === 'loaded') {
    return createPortal(
      <loaded.Experience display={display} onLeave={onLeave} onFocusStage={onFocusStage} />,
      display.screen,
    );
  }
  return loaded.state === 'failed'
    ? createPortal(<Unavailable display={display} onLeave={onLeave} />, display.screen)
    : null;
}

/** The screen could not load: say so in the screen's own idiom, and point to the résumé on the page. */
function Unavailable({ display, onLeave }: { readonly display: PcDisplay; readonly onLeave: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const messageId = useId();
  useEffect(() => display.onLiveChange((live) => live && root.current?.focus({ preventScroll: true })), [display]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onLeave();
  };
  return (
    <div className="pc-unavailable">
      <div
        ref={root}
        className="pc-unavailable__box"
        role="alertdialog"
        aria-label="Document Reader"
        aria-describedby={messageId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <p className="pc-unavailable__title" aria-hidden="true">
          Document Reader
        </p>
        <p id={messageId}>The document could not be opened.</p>
        <a href="#resume">Read the résumé</a>
      </div>
    </div>
  );
}

function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
