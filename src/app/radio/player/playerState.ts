import type { RadioKey, Transport } from '../deck';

/**
 * The CD player's state machine (SPEC §8.4): what a real CD player does with its keys,
 * plus the radio's own rules (the visit to the TV, the media keys). Pure: events in,
 * the next state and the effects to run out. The effects say what the sound must do;
 * `RadioPlayer` runs them.
 */

export interface PlayerState {
  /** The album on the spindle or on its way there; null for an empty player. */
  readonly disc: string | null;
  /** 1-based; 1 while empty. */
  readonly track: number;
  readonly transport: Transport;
  /** `inserting` from the pick until the disc is seated and ▷II pressed; the keys wait for it. */
  readonly phase: 'idle' | 'inserting' | 'ready';
  /** Paused because the visitor went to the TV: resumes when they leave it. */
  readonly pausedByTv: boolean;
  /** The current track could not be played; shown until the next action. */
  readonly error: boolean;
  /** Seconds into the current track. */
  readonly position: number;
  /** A disc going in reads as `-- --:--` until the first second of sound. */
  readonly reading: boolean;
}

export const EMPTY_PLAYER: PlayerState = {
  disc: null,
  track: 1,
  transport: 'stopped',
  phase: 'idle',
  pausedByTv: false,
  error: false,
  position: 0,
  reading: false,
};

/** The OS media controls (Media Session), by their action names. */
export type MediaAction = 'play' | 'pause' | 'stop' | 'previoustrack' | 'nexttrack';

export type PlayerEvent =
  /** A disc was chosen: on the model, its button, or Enter on it. */
  | { readonly type: 'pick'; readonly disc: string }
  /** The room says the disc is on the spindle and ▷II is down: the sound may start. */
  | { readonly type: 'seated'; readonly disc: string }
  | { readonly type: 'press'; readonly key: RadioKey }
  | { readonly type: 'media'; readonly action: MediaAction; readonly atTv: boolean }
  /** The camera arrives at (true) or leaves (false) the TV, where the game has the floor. */
  | { readonly type: 'tv'; readonly entering: boolean }
  /** The element's playback position, while it plays the current track. */
  | { readonly type: 'time'; readonly seconds: number }
  | { readonly type: 'ended' }
  | { readonly type: 'error' }
  /** Two seconds after an error while playing: move on. */
  | { readonly type: 'error-advance' }
  /** The browser refused to play (no user activation yet). */
  | { readonly type: 'blocked' }
  /** The browser or the OS paused the element (a headset unplugged, a phone call). */
  | { readonly type: 'interrupted' };

export type PlayerEffect =
  /** Load and start the disc's first track silently, now, inside the gesture; `swap` fades the playing one out first. */
  | { readonly type: 'start'; readonly swap: boolean }
  /** The disc is seated: rewind to 0 and fade in. */
  | { readonly type: 'open' }
  | { readonly type: 'pause'; readonly fadeMs: number }
  /** Sound now: play the current track from `position`, fading in over `fadeMs`. */
  | { readonly type: 'play'; readonly fadeMs: number }
  /** The track changed while playing: silence now, then play it from 0 (after the skip debounce when `debounce`). */
  | { readonly type: 'switch'; readonly debounce: boolean }
  /** Move on from an error in `ERROR_ADVANCE_MS`. */
  | { readonly type: 'schedule-advance' };

export interface Step {
  readonly state: PlayerState;
  readonly effects: readonly PlayerEffect[];
}

/** Fades, ms (SPEC §8.3): the TV's hand-over out and back, a pause, a resume. Instant where volume is read-only. */
export const FADES = {
  tvOut: 350,
  tvBack: 500,
  pause: 120,
  resume: 80,
  open: 120,
  swap: 250,
  perspective: 300,
} as const;
/** ⏮ goes back a track only within this many seconds of a track's start; later it restarts the track. */
export const RESTART_AFTER_SECONDS = 3;
/** Skips switch the sound this long after the last press, so three quick presses fetch only the third track. */
export const SKIP_DEBOUNCE_MS = 250;
export const ERROR_ADVANCE_MS = 2000;

/** How many tracks each disc has, by id: all the reducer needs to know about the shelf. */
export type TrackCounts = Readonly<Record<string, number>>;

const stay = (state: PlayerState): Step => ({ state, effects: [] });

export function playerReducer(state: PlayerState, event: PlayerEvent, counts: TrackCounts): Step {
  const step = reduce(state, event, counts);
  // Reading lasts only while a disc that is going in plays towards its first second of sound.
  return step.state.reading && step.state.transport !== 'playing'
    ? { ...step, state: { ...step.state, reading: false } }
    : step;
}

function reduce(state: PlayerState, event: PlayerEvent, counts: TrackCounts): Step {
  const tracks = state.disc === null ? 0 : (counts[state.disc] ?? 0);
  switch (event.type) {
    case 'pick': {
      if (event.disc === state.disc || counts[event.disc] === undefined) return stay(state);
      const audible = state.phase === 'ready' && state.transport === 'playing';
      return {
        state: { ...EMPTY_PLAYER, disc: event.disc, transport: 'playing', phase: 'inserting', reading: true },
        effects: [{ type: 'start', swap: audible }],
      };
    }
    case 'seated': {
      if (event.disc !== state.disc || state.phase !== 'inserting') return stay(state);
      const next = { ...state, phase: 'ready' as const };
      return { state: next, effects: state.transport === 'playing' ? [{ type: 'open' }] : [] };
    }
    case 'press':
      return press(state, event.key, tracks);
    case 'media':
      return media(state, event.action, event.atTv, tracks);
    case 'tv': {
      if (event.entering) {
        if (state.transport !== 'playing' || state.disc === null) return stay(state);
        return {
          state: { ...state, transport: 'paused', pausedByTv: true },
          effects: [{ type: 'pause', fadeMs: FADES.tvOut }],
        };
      }
      if (!state.pausedByTv) return stay(state);
      const next = { ...state, transport: 'playing' as const, pausedByTv: false };
      // Still going in: the seat opens the sound.
      return { state: next, effects: state.phase === 'ready' ? [{ type: 'play', fadeMs: FADES.tvBack }] : [] };
    }
    case 'time':
      if (state.transport !== 'playing' || state.phase !== 'ready') return stay(state);
      return stay({ ...state, position: event.seconds, reading: false });
    case 'ended':
      if (state.disc === null || state.transport !== 'playing') return stay(state);
      if (state.track < tracks) return { state: nextTrack(state), effects: [{ type: 'switch', debounce: false }] };
      return stay({ ...state, transport: 'stopped', track: 1, position: 0 });
    case 'error': {
      if (state.disc === null || state.error) return stay(state);
      if (state.transport === 'playing' && state.track < tracks) {
        return { state: { ...state, error: true, reading: false }, effects: [{ type: 'schedule-advance' }] };
      }
      // The track stays selected, so ▷II tries it again.
      return stay({ ...state, error: true, reading: false, transport: 'stopped', position: 0, pausedByTv: false });
    }
    case 'error-advance':
      if (!state.error || state.transport !== 'playing' || state.track >= tracks) return stay(state);
      return { state: nextTrack(state), effects: [{ type: 'switch', debounce: false }] };
    case 'blocked':
      if (state.transport !== 'playing') return stay(state);
      return stay({ ...state, transport: 'paused', reading: false });
    case 'interrupted':
      if (state.transport !== 'playing' || state.phase !== 'ready') return stay(state);
      return stay({ ...state, transport: 'paused', pausedByTv: false });
  }
}

function press(state: PlayerState, key: RadioKey, tracks: number): Step {
  // An empty player leaves the keys with nothing to do.
  if (state.disc === null) return stay(state);
  const acted = { ...state, error: false, pausedByTv: false, reading: false };
  if (state.phase === 'inserting') {
    // A disc still going in waits for its seat; but after a refused play, ▷II is the gesture that may start
    // it: silently again, for the seat to open.
    if (key !== 'play-pause' || state.transport !== 'paused') return stay(state);
    return { state: { ...acted, transport: 'playing', reading: true }, effects: [{ type: 'start', swap: false }] };
  }
  switch (key) {
    case 'play-pause':
      if (state.transport === 'playing') {
        return { state: { ...acted, transport: 'paused' }, effects: [{ type: 'pause', fadeMs: FADES.pause }] };
      }
      // Sound first: a paused disc fades in quickly; a stopped one starts at once.
      return {
        state: { ...acted, transport: 'playing' },
        effects: [{ type: 'play', fadeMs: state.transport === 'paused' ? FADES.resume : 0 }],
      };
    case 'stop':
      if (state.transport === 'stopped') return stay(acted);
      return {
        state: { ...acted, transport: 'stopped', track: 1, position: 0 },
        effects: [{ type: 'pause', fadeMs: FADES.pause }],
      };
    case 'next':
      if (state.track >= tracks) return stay(acted);
      return skipTo(acted, state.track + 1);
    case 'previous':
      return skipTo(acted, state.position > RESTART_AFTER_SECONDS || state.track === 1 ? state.track : state.track - 1);
  }
}

/** Selects `track` from its start; playing, the sound follows after the debounce. */
function skipTo(state: PlayerState, track: number): Step {
  const next = { ...state, track, position: 0 };
  return { state: next, effects: state.transport === 'playing' ? [{ type: 'switch', debounce: true }] : [] };
}

function media(state: PlayerState, action: MediaAction, atTv: boolean, tracks: number): Step {
  switch (action) {
    case 'play':
      // The game has the floor at the TV: remember the wish and play on leaving.
      if (atTv)
        return state.disc !== null && state.phase !== 'inserting' ? stay({ ...state, pausedByTv: true }) : stay(state);
      return state.transport === 'playing' ? stay(state) : press(state, 'play-pause', tracks);
    case 'pause':
      if (state.transport !== 'playing') return stay({ ...state, pausedByTv: false });
      return press(state, 'play-pause', tracks);
    case 'stop':
      return press({ ...state, pausedByTv: false }, 'stop', tracks);
    case 'previoustrack':
      return press(state, 'previous', tracks);
    case 'nexttrack':
      return press(state, 'next', tracks);
  }
}

function nextTrack(state: PlayerState): PlayerState {
  return { ...state, track: state.track + 1, position: 0, error: false, reading: false };
}
