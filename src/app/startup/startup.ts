import type { HostKind } from '../hosts/types';

/**
 * The page's opening choreography as a pure state machine:
 *
 *   loading ──(game + host ready)──▶ revealing ──(loading screen gone)──▶ powering ──(tube lit)──▶ running
 *
 * Splitting it out of React keeps the ordering rules testable: the game is
 * never started before the tube is lit, and the tube never lights behind the
 * loading screen.
 */
export type StartupPhase = 'loading' | 'revealing' | 'powering' | 'running' | 'failed';

export interface StartupState {
  readonly phase: StartupPhase;
  readonly gameLoaded: boolean;
  /** Host download progress, 0–1. */
  readonly hostProgress: number;
  /** The host that actually presents the game; may differ from the requested one after a fallback. */
  readonly host: HostKind | null;
}

export type StartupEvent =
  | { readonly type: 'gameLoaded' }
  | { readonly type: 'gameFailed' }
  | { readonly type: 'hostProgress'; readonly fraction: number }
  | { readonly type: 'hostReady'; readonly host: HostKind }
  | { readonly type: 'revealed' }
  | { readonly type: 'poweredOn' };

export const INITIAL_STARTUP: StartupState = { phase: 'loading', gameLoaded: false, hostProgress: 0, host: null };

/**
 * Share of the loading bar spent on the game's own assets (fonts, level art).
 * They are small and arrive first; the room's models dominate the download.
 */
const GAME_WEIGHT = 0.12;

export function startupReducer(state: StartupState, event: StartupEvent): StartupState {
  switch (event.type) {
    case 'gameLoaded':
      return state.phase === 'loading' ? { ...state, gameLoaded: true } : state;
    case 'gameFailed':
      return state.phase === 'loading' ? { ...state, phase: 'failed' } : state;
    case 'hostProgress':
      // Progress never runs backwards, even if a host reports late or out of order.
      return state.phase === 'loading'
        ? { ...state, hostProgress: Math.max(state.hostProgress, clamp01(event.fraction)) }
        : state;
    case 'hostReady':
      if (state.phase !== 'loading' || !state.gameLoaded) return state;
      return { ...state, phase: 'revealing', hostProgress: 1, host: event.host };
    case 'revealed':
      return state.phase === 'revealing' ? { ...state, phase: 'powering' } : state;
    case 'poweredOn':
      return state.phase === 'powering' ? { ...state, phase: 'running' } : state;
  }
}

/** The loading bar's fill, 0–1. */
export function loadingProgress(state: StartupState): number {
  if (state.phase !== 'loading' && state.phase !== 'failed') return 1;
  return (state.gameLoaded ? GAME_WEIGHT : 0) + (1 - GAME_WEIGHT) * state.hostProgress;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
