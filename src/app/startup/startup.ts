import type { HostKind } from '../hosts/types';

/**
 * The page's opening choreography as a pure state machine:
 *
 *   loading ──(game ready)──▶ powering ──(tube lit)──▶ running
 *
 * The room's startup still (docs/ROOM.md › Startup) is up from the first paint until the room host hands over to
 * the live scene (`stillDone`), or a flat host takes over (`hostReady` with `flat`): the game powers on and starts
 * on it, so it waits for the game's own assets only, never the room's. Splitting it out of React keeps the ordering
 * rules testable: the game is never started before the tube is lit.
 */
export type StartupPhase = 'loading' | 'powering' | 'running' | 'failed';

export interface StartupState {
  readonly phase: StartupPhase;
  /** The host that actually presents the game; may differ from the requested one after a fallback. */
  readonly host: HostKind | null;
  /** The startup still is showing. */
  readonly still: boolean;
}

export type StartupEvent =
  | { readonly type: 'gameLoaded' }
  | { readonly type: 'gameFailed' }
  | { readonly type: 'hostReady'; readonly host: HostKind }
  | { readonly type: 'poweredOn' }
  | { readonly type: 'stillDone' };

export const INITIAL_STARTUP: StartupState = { phase: 'loading', host: null, still: true };

export function startupReducer(state: StartupState, event: StartupEvent): StartupState {
  switch (event.type) {
    case 'gameLoaded':
      return state.phase === 'loading' ? { ...state, phase: 'powering' } : state;
    case 'gameFailed':
      return state.phase === 'loading' ? { ...state, phase: 'failed' } : state;
    case 'hostReady':
      // A flat host has a TV of its own: the room's still has nothing to stand for.
      return { ...state, host: event.host, still: state.still && event.host !== 'flat' };
    case 'poweredOn':
      return state.phase === 'powering' ? { ...state, phase: 'running' } : state;
    case 'stillDone':
      return state.still ? { ...state, still: false } : state;
  }
}
