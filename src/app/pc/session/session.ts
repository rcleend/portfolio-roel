import type { SplashStatus, Visit } from './storyboard';

/**
 * One visit to the computer, as a pure reducer: what the screen shows from
 * the landing frame (`desktop`) through the startup to the open `reader`,
 * then `closing`, until the room hides the screen again (`away`). Timers and
 * motion live in `useStoryboard`; this only decides what is on screen.
 */
export type PcPhase = 'away' | 'desktop' | 'launching' | 'splash' | 'opening' | 'reader' | 'closing';

export interface SessionState {
  readonly phase: PcPhase;
  readonly visit: Visit;
  /** The hidden reader finished mounting and paginating. */
  readonly ready: boolean;
  /** The window was due to open before the reader was ready: it opens the moment it is. */
  readonly openPending: boolean;
  /** The visitor skipped before the reader was ready: it opens straight to reading the moment it is. */
  readonly skipPending: boolean;
  readonly status: SplashStatus;
  /** The CV icon is selected (the first click of the double-click). */
  readonly selected: boolean;
  /** The résumé page is shown in the window (fading in or in full). */
  readonly page: boolean;
  /** Pop-out only: the reader has grown out of the glass. */
  readonly breakout: boolean;
  /** Closing: the window is gone (immediately, or after shrinking back into the glass). */
  readonly windowGone: boolean;
}

export type SessionEvent =
  | { readonly type: 'live'; readonly visit: Visit }
  | { readonly type: 'select' }
  | { readonly type: 'launch' }
  | { readonly type: 'splash'; readonly status: SplashStatus }
  | { readonly type: 'open' }
  | { readonly type: 'ready' }
  | { readonly type: 'page' }
  | { readonly type: 'breakout' }
  | { readonly type: 'read' }
  | { readonly type: 'skip' }
  /** `shrink`: the reader first shrinks back into the glass (pop-out with motion). */
  | { readonly type: 'close'; readonly shrink: boolean }
  | { readonly type: 'shrunk' }
  | { readonly type: 'away' };

export const AWAY: SessionState = {
  phase: 'away',
  visit: 'first',
  ready: false,
  openPending: false,
  skipPending: false,
  status: 'initializing',
  selected: false,
  page: false,
  breakout: false,
  windowGone: false,
};

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'live':
      return { ...AWAY, phase: 'desktop', visit: event.visit };
    case 'away':
      return state.phase === 'away' ? state : { ...AWAY, visit: state.visit };
    case 'select':
      return state.phase === 'desktop' ? { ...state, selected: true } : state;
    case 'launch':
      return state.phase === 'desktop' ? { ...state, phase: 'launching', selected: true } : state;
    case 'splash':
      return state.phase === 'launching' || state.phase === 'splash'
        ? { ...state, phase: 'splash', status: event.status }
        : state;
    case 'open':
      if (state.phase !== 'launching' && state.phase !== 'splash') return state;
      return state.ready ? opened(state) : { ...state, openPending: true };
    case 'ready':
      if (!isMounted(state)) return state;
      if (state.skipPending) return reading({ ...state, ready: true });
      if (state.openPending) return opened({ ...state, ready: true });
      return { ...state, ready: true };
    case 'page':
      return state.phase === 'opening' ? { ...state, page: true } : state;
    case 'breakout':
      return state.phase === 'opening' ? { ...state, page: true, breakout: true } : state;
    case 'read':
      return state.phase === 'opening' ? reading(state) : state;
    case 'skip':
      return skip(state);
    case 'close':
      if (!isClosable(state)) return state;
      // A window that vanishes at once also unmounts the reader; one shrinking back keeps it until it is gone.
      return { ...state, phase: 'closing', windowGone: !event.shrink, ready: event.shrink && state.ready };
    case 'shrunk':
      return state.phase === 'closing' && !state.windowGone ? { ...state, windowGone: true, ready: false } : state;
  }
}

function opened(state: SessionState): SessionState {
  return { ...state, phase: 'opening', openPending: false, selected: true };
}

function reading(state: SessionState): SessionState {
  return {
    ...state,
    phase: 'reader',
    openPending: false,
    skipPending: false,
    selected: true,
    page: true,
    breakout: true,
  };
}

/** Any input during the startup jumps to the open reader, through the splash while the reader is still mounting. */
function skip(state: SessionState): SessionState {
  switch (state.phase) {
    case 'desktop':
    case 'launching':
    case 'splash':
      return state.ready
        ? reading(state)
        : { ...state, phase: 'splash', status: 'opening', selected: true, skipPending: true, openPending: false };
    case 'opening':
      return reading(state);
    default:
      return state;
  }
}

/** The startup is still playing: input skips it. */
export function isStarting(state: SessionState): boolean {
  return (
    state.phase === 'desktop' || state.phase === 'launching' || state.phase === 'splash' || state.phase === 'opening'
  );
}

/** Close and Escape act from the landing until the window is closing. */
export function isClosable(state: SessionState): boolean {
  return state.phase !== 'away' && state.phase !== 'closing';
}

/** The reader is in the DOM: hidden while it mounts, then shown until the window is gone. */
export function isMounted(state: SessionState): boolean {
  return (
    state.phase === 'launching' ||
    state.phase === 'splash' ||
    state.phase === 'opening' ||
    state.phase === 'reader' ||
    (state.phase === 'closing' && !state.windowGone)
  );
}

/** The window is on screen (maximised), with its taskbar button. */
export function isWindowShown(state: SessionState): boolean {
  return state.phase === 'opening' || state.phase === 'reader' || (state.phase === 'closing' && !state.windowGone);
}

/** The cursor shows the busy arrow while the reader opens. */
export function isBusy(state: SessionState): boolean {
  return state.phase === 'launching' || state.phase === 'splash';
}
