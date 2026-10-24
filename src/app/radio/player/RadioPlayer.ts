import type { Album, Track } from '@/content/radio/types';
import type { DeckState, RadioDeck, RadioKey, RoomView, Transport } from '../deck';
import { announcement, type DescribeTrack, type Spoken, shouldSay } from './announce';
import { radioAudio, tvTransition } from './audioPolicy';
import type { FoleyCue } from './foley';
import { type DiscTotals, lcdReadout, sameReadout } from './lcdReadout';
import type { MusicListener } from './MusicElement';
import type { MediaSessionBridge, NowPlaying } from './mediaSession';
import {
  EMPTY_PLAYER,
  ERROR_ADVANCE_MS,
  FADES,
  type MediaAction,
  type PlayerEffect,
  type PlayerEvent,
  type PlayerState,
  playerReducer,
  SKIP_DEBOUNCE_MS,
  type TrackCounts,
} from './playerState';

/**
 * The CD player's imperative shell (SPEC §8): it feeds the reducer with the visitor's
 * gestures, the room's mechanics and the element's events, runs the effects on the one
 * media element, keeps the room's deck, the OS's media session and the live region in
 * step, and owns the skip debounce and the error advance.
 *
 * The room never changes the deck on its own: every pick or press is answered here, in
 * the same call, with `setState`, so the room animates the answer on the same frame.
 */

/** The media element as the player drives it (MusicElement). */
export interface Music {
  readonly source: string | null;
  startSilently(url: string): void;
  swapSilently(url: string, ms: number): void;
  open(volume: number, ms: number): void;
  play(url: string, at: number, volume: number, ms: number): void;
  pause(ms: number): void;
  quiet(): void;
  setVolume(volume: number, ms: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

/** The mechanical sounds (FoleyPlayer). */
export interface Foley {
  wake(): void;
  sleepSoon(ms: number): void;
  play(cue: FoleyCue, pan?: number, order?: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

export interface Timers {
  set(callback: () => void, ms: number): number;
  clear(handle: number): void;
}

export interface RadioPlayerOptions {
  readonly deck: RadioDeck;
  readonly albums: readonly Album[];
  /** The URL of a file in an album's folder (or the https URL it names). */
  readonly fileUrl: (album: Album, name: string) => string;
  /** Makes the music element, which reports to `listener`. */
  readonly music: (listener: MusicListener) => Music;
  readonly foley: Foley;
  readonly session: MediaSessionBridge;
  readonly view: RoomView;
  readonly muted: boolean;
  readonly timers?: Timers;
  readonly now?: () => number;
}

/** What the controls render: changes only when something they show does (never with the clock). */
export interface PlayerSnapshot {
  readonly disc: string | null;
  readonly album: Album | null;
  readonly track: number;
  readonly trackTitle: string | null;
  readonly transport: Transport;
  readonly inserting: boolean;
  readonly error: boolean;
}

/** The foley's motor stops two seconds after the visitor leaves the radio. */
export const FOLEY_SLEEP_MS = 2000;

const KEY_FOR_ACTION: Readonly<Record<MediaAction, RadioKey | null>> = {
  play: 'play-pause',
  pause: 'play-pause',
  stop: 'stop',
  previoustrack: 'previous',
  nexttrack: 'next',
};

const WINDOW_TIMERS: Timers = {
  set: (callback, ms) => window.setTimeout(callback, ms),
  clear: (handle) => window.clearTimeout(handle),
};

export class RadioPlayer {
  readonly #deck: RadioDeck;
  readonly #albums: ReadonlyMap<string, Album>;
  readonly #counts: TrackCounts;
  readonly #fileUrl: (album: Album, name: string) => string;
  readonly #music: Music;
  readonly #foley: Foley;
  readonly #session: MediaSessionBridge;
  readonly #timers: Timers;
  readonly #now: () => number;
  #state: PlayerState = EMPTY_PLAYER;
  #view: RoomView;
  #muted: boolean;
  #deckState: DeckState | null = null;
  #sessionKey = '';
  #snapshot: PlayerSnapshot;
  #switchTimer: number | null = null;
  #advanceTimer: number | null = null;
  #spoken: Spoken | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #announcers = new Set<(words: string) => void>();

  constructor(options: RadioPlayerOptions) {
    this.#deck = options.deck;
    this.#albums = new Map(options.albums.map((album) => [album.id, album]));
    this.#counts = Object.fromEntries(options.albums.map((album) => [album.id, album.tracks.length]));
    this.#fileUrl = options.fileUrl;
    this.#foley = options.foley;
    this.#session = options.session;
    this.#view = options.view;
    this.#muted = options.muted;
    this.#timers = options.timers ?? WINDOW_TIMERS;
    this.#now = options.now ?? (() => performance.now());
    this.#music = options.music({
      playing: () => undefined,
      time: (seconds) => this.#fromElement({ type: 'time', seconds }),
      ended: () => this.#fromElement({ type: 'ended' }),
      error: () => this.#fromElement({ type: 'error' }),
      interrupted: () => this.#dispatch({ type: 'interrupted' }),
      blocked: () => this.#dispatch({ type: 'blocked' }),
    });
    this.#music.setMuted(this.#muted);
    this.#foley.setMuted(this.#muted);
    this.#snapshot = this.#makeSnapshot();
  }

  /** Listens to the room and the OS; returns the disconnect, which also stops the sound. */
  connect(): () => void {
    this.#session.onAction((action) => this.media(action));
    const stops = [
      this.#deck.onIntent((intent) => {
        // Inside the gesture: the foley's context may start now, even on iOS.
        this.#foley.wake();
        if (intent.type === 'pick') this.#dispatch({ type: 'pick', disc: intent.disc });
        else this.#dispatch({ type: 'press', key: intent.key });
      }),
      this.#deck.onSeated((disc) => this.#dispatch({ type: 'seated', disc })),
      this.#deck.onCue((event) => this.#foley.play(event.cue, event.pan, event.order)),
    ];
    if (this.#view === 'radio') this.#foley.wake();
    this.#publish();
    return () => {
      for (const stop of stops) stop();
      this.#clearTimers();
      this.#music.dispose();
      this.#foley.dispose();
      this.#session.update(null);
      // A later connect tells the room and the OS everything again.
      this.#deckState = null;
      this.#sessionKey = '';
    };
  }

  // ── The visitor ───────────────────────────────────────────────────────────────

  /** A CD chosen with its button (Enter or Space): the room animates the insert from the answer. */
  pick(disc: string): void {
    this.#foley.wake();
    this.#dispatch({ type: 'pick', disc });
  }

  /** A key on the DOM toolbar or the touch bar: the 3D key presses too. */
  press(key: RadioKey): void {
    this.#foley.wake();
    this.#deck.press(key);
    this.#dispatch({ type: 'press', key });
  }

  /** The OS's media controls; the radio's key moves too while the visitor is there to see it. */
  media(action: MediaAction): void {
    const key = KEY_FOR_ACTION[action];
    if (key && this.#deck.live && this.#state.disc !== null) this.#deck.press(key);
    this.#dispatch({ type: 'media', action, atTv: this.#view === 'tv' });
  }

  setView(view: RoomView): void {
    const previous = this.#view;
    if (view === previous) return;
    this.#view = view;
    if (view === 'radio') this.#foley.wake();
    else if (previous === 'radio') this.#foley.sleepSoon(FOLEY_SLEEP_MS);
    const audio = radioAudio(view, this.#album()?.gainDb);
    if (audio.audible) this.#music.setVolume(audio.volume, FADES.perspective);
    const tv = tvTransition(previous, view);
    if (tv === null) this.#publish();
    else this.#dispatch({ type: 'tv', entering: tv });
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    this.#music.setMuted(muted);
    this.#foley.setMuted(muted);
  }

  // ── Readers ───────────────────────────────────────────────────────────────────

  get state(): PlayerState {
    return this.#state;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): PlayerSnapshot => this.#snapshot;

  /** The live region's words, deduplicated. */
  onAnnounce(listener: (words: string) => void): () => void {
    this.#announcers.add(listener);
    return () => this.#announcers.delete(listener);
  }

  // ── The machine ───────────────────────────────────────────────────────────────

  /** Element events about a track the player no longer means (a stale tick, a late error) are dropped. */
  #fromElement(event: PlayerEvent): void {
    if (this.#music.source === null || this.#music.source !== this.#trackUrl()) return;
    this.#dispatch(event);
  }

  #dispatch(event: PlayerEvent): void {
    const previous = this.#state;
    const { state, effects } = playerReducer(previous, event, this.#counts);
    this.#state = state;
    for (const effect of effects) this.#run(effect);
    const words = announcement(previous, state, event, this.#describe, this.#muted);
    if (words) this.#say(words);
    this.#publish();
  }

  #run(effect: PlayerEffect): void {
    switch (effect.type) {
      case 'start': {
        this.#clearTimers();
        const url = this.#trackUrl();
        if (!url) return;
        if (effect.swap) this.#music.swapSilently(url, FADES.swap);
        else this.#music.startSilently(url);
        return;
      }
      case 'open':
        this.#music.open(this.#volume(), FADES.open);
        return;
      case 'pause':
        this.#cancelSwitch();
        this.#music.pause(effect.fadeMs);
        return;
      case 'play': {
        this.#cancelSwitch();
        const url = this.#trackUrl();
        if (url) this.#music.play(url, this.#state.position, this.#volume(), effect.fadeMs);
        return;
      }
      case 'switch':
        this.#music.quiet();
        this.#cancelSwitch();
        if (!effect.debounce) this.#switchNow();
        else this.#switchTimer = this.#timers.set(() => this.#switchNow(), SKIP_DEBOUNCE_MS);
        return;
      case 'schedule-advance':
        if (this.#advanceTimer !== null) this.#timers.clear(this.#advanceTimer);
        this.#advanceTimer = this.#timers.set(() => {
          this.#advanceTimer = null;
          this.#dispatch({ type: 'error-advance' });
        }, ERROR_ADVANCE_MS);
        return;
    }
  }

  /** The skip lands: the current track from its start, with the seek's tick. */
  #switchNow(): void {
    this.#switchTimer = null;
    const state = this.#state;
    const url = this.#trackUrl();
    if (!url || state.transport !== 'playing') return;
    // A disc still going in stays silent until it is seated.
    if (state.phase === 'inserting') {
      this.#music.startSilently(url);
      return;
    }
    this.#music.play(url, 0, this.#volume(), FADES.resume);
    this.#foley.play('seek');
  }

  #cancelSwitch(): void {
    if (this.#switchTimer === null) return;
    this.#timers.clear(this.#switchTimer);
    this.#switchTimer = null;
  }

  #clearTimers(): void {
    this.#cancelSwitch();
    if (this.#advanceTimer !== null) this.#timers.clear(this.#advanceTimer);
    this.#advanceTimer = null;
  }

  #say(words: string): void {
    const now = this.#now();
    if (!shouldSay(this.#spoken, words, now)) return;
    this.#spoken = { text: words, at: now };
    for (const listener of this.#announcers) listener(words);
  }

  /** Brings the room, the OS and the controls up to date with the state. */
  #publish(): void {
    const state = this.#state;
    const album = this.#album();
    const lcd = lcdReadout(state, this.#view, album ? totals(album) : null);
    const previous = this.#deckState;
    if (
      !previous ||
      previous.loaded !== state.disc ||
      previous.transport !== state.transport ||
      !sameReadout(previous.lcd, lcd)
    ) {
      this.#deckState = { loaded: state.disc, transport: state.transport, lcd };
      this.#deck.setState(this.#deckState);
    }
    this.#updateSession(state, album);
    const snapshot = this.#makeSnapshot();
    if (!sameSnapshot(snapshot, this.#snapshot)) {
      this.#snapshot = snapshot;
      for (const listener of this.#listeners) listener();
    }
  }

  /** The OS hears of a disc, a track or a transport change, and of each skip, not of every tick. */
  #updateSession(state: PlayerState, album: Album | null): void {
    const track = album?.tracks[state.track - 1];
    const key = album && track ? `${album.id}/${state.track}/${state.transport}/${state.position === 0}` : '';
    if (key === this.#sessionKey) return;
    this.#sessionKey = key;
    this.#session.update(album && track ? this.#nowPlaying(album, track, state) : null);
  }

  #nowPlaying(album: Album, track: Track, state: PlayerState): NowPlaying {
    return {
      title: track.title,
      artist: album.artist,
      album: album.title,
      artwork: new URL(this.#fileUrl(album, album.cover), window.location.href).href,
      transport: state.transport,
      duration: track.seconds,
      position: state.position,
    };
  }

  #makeSnapshot(): PlayerSnapshot {
    const state = this.#state;
    const album = this.#album();
    return {
      disc: state.disc,
      album,
      track: state.track,
      trackTitle: album?.tracks[state.track - 1]?.title ?? null,
      transport: state.transport,
      inserting: state.phase === 'inserting',
      error: state.error,
    };
  }

  #album(): Album | null {
    return this.#state.disc === null ? null : (this.#albums.get(this.#state.disc) ?? null);
  }

  #trackUrl(): string | null {
    const album = this.#album();
    const track = album?.tracks[this.#state.track - 1];
    return album && track ? this.#fileUrl(album, track.file) : null;
  }

  #volume(): number {
    return radioAudio(this.#view === 'tv' ? 'room' : this.#view, this.#album()?.gainDb).volume;
  }

  readonly #describe: DescribeTrack = (disc, number) => {
    const album = this.#albums.get(disc);
    const track = album?.tracks[number - 1];
    return album && track
      ? { title: track.title, number, count: album.tracks.length, album: album.title, artist: album.artist }
      : null;
  };
}

function totals(album: Album): DiscTotals {
  return { tracks: album.tracks.length, seconds: album.tracks.reduce((sum, track) => sum + track.seconds, 0) };
}

function sameSnapshot(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
  return (
    a.disc === b.disc &&
    a.track === b.track &&
    a.transport === b.transport &&
    a.inserting === b.inserting &&
    a.error === b.error
  );
}
