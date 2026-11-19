import type { HostKind } from '../hosts/types';

/**
 * The page's opening choreography as a pure state machine:
 *
 *   loading ──(game ready)──▶ powering ──(tube lit)──▶ running
 *
 * The room's startup still (docs/ROOM.md › Startup) is up from the first paint until the room host hands over to
 * the live scene (`stillDone`), or a flat host takes over (`hostReady` with `flat`), and again while the room is
 * without its light after a lost WebGL context (`stillBack`): the game powers on and starts
 * on it, so it waits for the game's own assets only, never the room's. It is out of sight a little after it is done
 * (`stillGone`, its fade over), and what would arrive with the hand-over waits for that. Splitting it out of React keeps the ordering
 * rules testable: the game is never started before the tube is lit.
 */
export type StartupPhase = 'loading' | 'powering' | 'running' | 'failed';

export interface StartupState {
  readonly phase: StartupPhase;
  /** The host that actually presents the game; may differ from the requested one after a fallback. */
  readonly host: HostKind | null;
  /** The startup still is showing. */
  readonly still: boolean;
  /** The still is out of sight, its fade over: the page's own controls may arrive (the touch pad, the guide's hint). */
  readonly clear: boolean;
}

export type StartupEvent =
  | { readonly type: 'gameLoaded' }
  | { readonly type: 'gameFailed' }
  | { readonly type: 'hostReady'; readonly host: HostKind }
  | { readonly type: 'poweredOn' }
  | { readonly type: 'stillDone' }
  | { readonly type: 'stillGone' }
  | { readonly type: 'stillBack' };

export const INITIAL_STARTUP: StartupState = { phase: 'loading', host: null, still: true, clear: false };

export function startupReducer(state: StartupState, event: StartupEvent): StartupState {
  switch (event.type) {
    case 'gameLoaded':
      return state.phase === 'loading' ? { ...state, phase: 'powering' } : state;
    case 'gameFailed':
      return state.phase === 'loading' ? { ...state, phase: 'failed' } : state;
    case 'hostReady':
      // A flat host has a TV of its own: the room's still has nothing to stand for.
      return event.host === 'flat' ? { ...state, host: 'flat', still: false, clear: true } : { ...state, host: 'room' };
    case 'poweredOn':
      return state.phase === 'powering' ? { ...state, phase: 'running' } : state;
    case 'stillDone':
      return state.still ? { ...state, still: false } : state;
    case 'stillGone':
      return state.still || state.clear ? state : { ...state, clear: true };
    case 'stillBack':
      // The room lost its light (a lost WebGL context): the still covers it until it is lit again.
      return state.host === 'room' && !state.still ? { ...state, still: true, clear: false } : state;
  }
}
