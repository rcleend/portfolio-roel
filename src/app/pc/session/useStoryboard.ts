import { createRef, type Dispatch, type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DesktopLayout } from '../desktop/desktopLayout';
import type { PcDisplay } from '../display';
import { flipTransform } from '../popout/flip';
import type { PresentationMode } from '../presentation';
import { readerMemory } from './memory';
import type { CursorDirector } from './ScriptedCursor';
import { isClosable, isMounted, isStarting, isWindowShown, type SessionEvent, type SessionState } from './session';
import {
  CLOSE_BEAT_MS,
  CURSOR_FADE_OUT_MS,
  CURSOR_START,
  type Cue,
  SHRINK_MS,
  type Storyboard,
  storyboard,
} from './storyboard';

/** The elements the storyboard moves. Refs, because they mount and unmount with the session. */
export interface StoryboardElements {
  readonly root: RefObject<HTMLElement | null>;
  readonly cursor: RefObject<CursorDirector | null>;
  readonly splash: RefObject<HTMLDivElement | null>;
  /** The open document's pane and the layer its page fades in on (in the glass, or in the pop-out). */
  readonly pane: RefObject<HTMLDivElement | null>;
  readonly pageLayer: RefObject<HTMLDivElement | null>;
  /** The in-glass window: where the pop-out grows from and shrinks back to. */
  readonly glassWindow: RefObject<HTMLDivElement | null>;
  readonly popOut: RefObject<HTMLDivElement | null>;
  readonly popOutWindow: RefObject<HTMLDivElement | null>;
  readonly scrim: RefObject<HTMLDivElement | null>;
}

/** One stable set of refs for the screen's lifetime. */
export function useStoryboardElements(): StoryboardElements {
  const [elements] = useState(() => ({
    root: createRef<HTMLElement>(),
    cursor: createRef<CursorDirector>(),
    splash: createRef<HTMLDivElement>(),
    pane: createRef<HTMLDivElement>(),
    pageLayer: createRef<HTMLDivElement>(),
    glassWindow: createRef<HTMLDivElement>(),
    popOut: createRef<HTMLDivElement>(),
    popOutWindow: createRef<HTMLDivElement>(),
    scrim: createRef<HTMLDivElement>(),
  }));
  return elements;
}

export interface StoryboardOptions {
  readonly display: PcDisplay;
  readonly state: SessionState;
  readonly dispatch: Dispatch<SessionEvent>;
  readonly mode: PresentationMode;
  readonly reducedMotion: boolean;
  readonly layout: DesktopLayout;
  readonly elements: StoryboardElements;
  /** Remembers where the visitor is reading, before the document goes. */
  readonly rememberScroll: () => void;
  /** Says something to screen readers through the screen's polite live region. */
  readonly announce: (text: string) => void;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

export interface StoryboardControls {
  /** Any input during the startup: jump to the open reader. */
  readonly skip: () => void;
  /** The close button or Escape: close the window, hold the desktop a beat, then leave the computer. */
  readonly close: () => void;
}

/** The monitor's light while the white page is up: a neutral, slightly dim white. */
const PAGE_LIGHT = { r: 0.8, g: 0.8, b: 0.8 } as const;
/** The room's own cross-fade length, used when this chunk arrives after the screen is already live. */
const LATE_FADE_MS = 160;
const FLIP_EASING = 'cubic-bezier(.2, .8, .2, 1)';
/** The `performance` mark and measure of the reader's mount, from the second click (or a skip) to ready. */
export const MOUNT_MARK = 'pc-reader-mount';

/**
 * Runs the startup storyboard against the session reducer: cue timers from
 * the landing frame, WAAPI motion on transform and opacity (never awaited),
 * the monitor's light, focus, and the way out. t = 0 is `display.live`
 * turning true; `live` turning false cancels everything at once.
 */
export function useStoryboard(options: StoryboardOptions): StoryboardControls {
  const { display, state, dispatch, mode, reducedMotion, layout, elements, rememberScroll } = options;
  const [timers] = useState(() => new CueTimers());
  const board = useRef<Storyboard | null>(null);
  const lit = useRef(false);

  const cancelMotion = (): void => {
    for (const element of [elements.root.current, elements.popOut.current]) {
      for (const animation of element?.getAnimations({ subtree: true }) ?? []) animation.cancel();
    }
  };

  const light = (on: boolean): void => {
    if (lit.current === on) return;
    lit.current = on;
    display.setLight(on ? PAGE_LIGHT : null);
  };

  const runCue = useEffectEvent((cue: Cue) => {
    const cursor = elements.cursor.current;
    const cv = layout.icons[0];
    // The cursor's tip aims at the middle of the CV's art.
    const icon = cv ? { x: cv.art.x + cv.art.width / 2, y: cv.art.y + cv.art.height / 2 } : { x: 0, y: 0 };
    switch (cue.kind) {
      case 'cursor':
        cursor?.show(
          cue.onIcon ? icon : { x: CURSOR_START.x * layout.width, y: CURSOR_START.y * layout.height },
          cue.duration,
        );
        return;
      case 'glide':
        cursor?.glide(icon, cue.duration);
        return;
      case 'select':
        dispatch({ type: 'select' });
        cursor?.press(cue.dip);
        return;
      case 'launch':
        performance.mark(MOUNT_MARK);
        dispatch({ type: 'launch' });
        cursor?.setBusy(true);
        cursor?.press(cue.dip);
        options.announce('Opening the résumé…');
        return;
      case 'splash':
        flushSync(() => dispatch({ type: 'splash', status: cue.status }));
        if (cue.duration > 0) {
          elements.splash.current?.animate(
            { opacity: [0, 1], transform: ['scale(0.96)', 'none'] },
            { duration: cue.duration, easing: 'ease-out' },
          );
        }
        return;
      case 'status':
        dispatch({ type: 'splash', status: cue.status });
        return;
      case 'page':
        flushSync(() => dispatch({ type: 'page' }));
        elements.pageLayer.current?.animate({ opacity: [0, 1] }, { duration: cue.duration });
        return;
      case 'breakout':
        breakOut(cue.duration);
        return;
      case 'read':
        dispatch({ type: 'read' });
        return;
    }
  });

  /** The pop-out reader grows from the in-glass window to the viewport (FLIP, transform only) over a darkening scrim. */
  const breakOut = (duration: number): void => {
    const from = elements.glassWindow.current?.getBoundingClientRect();
    flushSync(() => dispatch({ type: 'breakout' }));
    const reader = elements.popOutWindow.current;
    if (!from || !reader) return;
    reader.animate(
      { transform: [flipTransform(from, reader.getBoundingClientRect()), 'none'] },
      { duration, easing: FLIP_EASING },
    );
    elements.scrim.current?.animate({ opacity: [0, 1] }, { duration });
  };

  /** The screen went live. `late`: this chunk arrived after the landing, so fade in as the room would have. */
  const begin = useEffectEvent((late: boolean) => {
    timers.clear();
    cancelMotion();
    if (late && !reducedMotion) {
      elements.root.current?.animate({ opacity: [0, 1] }, { duration: LATE_FADE_MS, easing: 'ease-out' });
    }
    const next = storyboard({ visit: readerMemory.opened ? 'warm' : 'first', reducedMotion, mode });
    board.current = next;
    lit.current = false;
    dispatch({ type: 'live', visit: next.visit });
    elements.root.current?.focus({ preventScroll: true });
    for (const cue of next.intro) timers.at(cue.at, () => runCue(cue));
    timers.at(next.openAt, () => dispatch({ type: 'open' }));
  });

  const end = useEffectEvent(() => {
    rememberScroll();
    timers.clear();
    cancelMotion();
    elements.cursor.current?.hide(0);
    const focused = [elements.root.current, elements.popOut.current].some((element) =>
      element?.contains(document.activeElement),
    );
    lit.current = false;
    options.announce('');
    dispatch({ type: 'away' });
    // The screen is hidden this very frame; focus must not be stranded in it.
    if (focused) options.onFocusStage();
  });

  useEffect(() => {
    if (display.live) begin(true);
    return display.onLiveChange((live) => (live ? begin(false) : end()));
  }, [display]);

  useEffect(() => () => timers.clear(), [timers]);

  const onOpened = useEffectEvent(() => {
    readerMemory.opened = true;
    elements.cursor.current?.setBusy(false);
    light(true);
    for (const cue of board.current?.afterOpen ?? []) timers.at(cue.at, () => runCue(cue));
  });

  const onReading = useEffectEvent(() => {
    readerMemory.opened = true;
    // Said once; the document is open now and its dialog speaks for itself.
    options.announce('');
    light(true);
    const cursor = elements.cursor.current;
    cursor?.setBusy(false);
    cursor?.hide(reducedMotion ? 0 : CURSOR_FADE_OUT_MS);
    elements.pane.current?.focus({ preventScroll: true });
  });

  const onClosed = useEffectEvent(() => {
    light(false);
    timers.at(CLOSE_BEAT_MS, () => options.onLeave());
  });

  const { phase, windowGone } = state;
  useEffect(() => {
    if (phase === 'opening') onOpened();
    else if (phase === 'reader') onReading();
    else if (phase === 'closing' && windowGone) onClosed();
  }, [phase, windowGone]);

  const onHidden = useEffectEvent(() => skip());
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') onHidden();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const skip = (): void => {
    if (!isStarting(state)) return;
    timers.clear();
    cancelMotion();
    elements.cursor.current?.hide(0);
    if (!isMounted(state)) performance.mark(MOUNT_MARK);
    dispatch({ type: 'skip' });
  };

  const close = (): void => {
    if (!isClosable(state)) return;
    rememberScroll();
    timers.clear();
    cancelMotion();
    elements.cursor.current?.hide(0);
    // The focused control is about to vanish with the window; keep focus on the screen.
    elements.root.current?.focus({ preventScroll: true });
    const shrink = mode === 'pop-out' && state.breakout && isWindowShown(state) && !reducedMotion;
    if (shrink) shrinkBack();
    dispatch({ type: 'close', shrink });
    if (shrink) timers.at(SHRINK_MS, () => dispatch({ type: 'shrunk' }));
  };

  /** The reverse FLIP: the pop-out reader shrinks back onto the in-glass window before it closes. */
  const shrinkBack = (): void => {
    const reader = elements.popOutWindow.current;
    const to = elements.glassWindow.current?.getBoundingClientRect();
    if (!reader || !to) return;
    const timing = { duration: SHRINK_MS, easing: FLIP_EASING, fill: 'forwards' } as const;
    reader.animate({ transform: ['none', flipTransform(to, reader.getBoundingClientRect())] }, timing);
    elements.scrim.current?.animate({ opacity: [1, 0] }, timing);
  };

  return { skip, close };
}

/** setTimeout handles for one visit, cleared together whenever the visit is interrupted. */
class CueTimers {
  readonly #handles = new Set<number>();

  at(delayMs: number, run: () => void): void {
    const handle = window.setTimeout(() => {
      this.#handles.delete(handle);
      run();
    }, delayMs);
    this.#handles.add(handle);
  }

  clear(): void {
    for (const handle of this.#handles) window.clearTimeout(handle);
    this.#handles.clear();
  }
}
