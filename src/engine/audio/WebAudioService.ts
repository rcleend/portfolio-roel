import type { AudioService, MusicOptions, SfxOptions } from './AudioService';
import { DEFAULT_MIX, Mixer, type MixLevels } from './mix/Mixer';
import { MusicDeck } from './music/MusicDeck';
import { type CompiledSong, compileSong, type Song } from './sequencer/song';
import type { SfxRecipe } from './sfx/recipe';
import { SfxPlayer } from './sfx/SfxPlayer';

export interface WebAudioServiceOptions<MusicId extends string, SfxId extends string> {
  readonly music: Readonly<Record<MusicId, Song>>;
  readonly sfx: Readonly<Record<SfxId, SfxRecipe>>;
  /** Called on the first `unlock()`. Defaults to a new `AudioContext`. */
  readonly createContext?: () => AudioContext;
  /** Source of visibility changes; defaults to `document`. Pass `null` to keep playing while hidden. */
  readonly visibility?: Document | null;
  readonly levels?: MixLevels;
  /** Wall clock in milliseconds; defaults to `performance.now`. */
  readonly now?: () => number;
}

/**
 * How often the scheduler wakes, and how far ahead of the audio clock it
 * places notes. Timing comes from the audio clock, never from the timer, so
 * a late wake-up (a busy frame, a throttled tab) cannot make the music drag:
 * as long as a wake comes within the lookahead, every note lands exactly.
 */
const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD = 0.2;
/** A new track starts this far in the future so its first notes are never already late. */
const START_DELAY = 0.05;
/** Seconds the old track takes to fade out under a new one. */
const DEFAULT_CROSSFADE = 0.4;

/** Everything that exists only once the context does. */
interface Engine {
  readonly context: AudioContext;
  readonly mixer: Mixer;
  readonly deck: MusicDeck;
  readonly sfx: SfxPlayer;
  readonly timer: number;
}

interface PendingMusic<MusicId> {
  readonly id: MusicId;
  readonly options: MusicOptions;
  readonly requestedAt: number;
}

/**
 * The real `AudioService`: synthesised music and effects on WebAudio.
 *
 * The context is created on the first `unlock()` (call it from a user
 * gesture), so pages that never interact never trigger the browser's
 * autoplay warnings. Music requested earlier is remembered and starts on
 * unlock; a one-shot (the boot jingle) joins at the position it would have
 * reached, so it stays in step with the picture. Effects requested while
 * locked, paused or hidden are dropped: they belong to a moment that passed.
 *
 * The context runs only while unlocked, not paused and the page is visible;
 * suspending it freezes music mid-note and resuming continues seamlessly.
 */
export class WebAudioService<MusicId extends string, SfxId extends string> implements AudioService<MusicId, SfxId> {
  readonly #music: Readonly<Record<MusicId, Song>>;
  readonly #sfxRecipes: Readonly<Record<SfxId, SfxRecipe>>;
  readonly #createContext: () => AudioContext;
  readonly #visibility: Document | null;
  readonly #levels: MixLevels;
  readonly #now: () => number;
  readonly #compiled = new Map<MusicId, CompiledSong>();
  #engine: Engine | null = null;
  #pending: PendingMusic<MusicId> | null = null;
  #muted = false;
  #paused = false;
  #hidden = false;

  constructor(options: WebAudioServiceOptions<MusicId, SfxId>) {
    this.#music = options.music;
    this.#sfxRecipes = options.sfx;
    this.#createContext = options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
    this.#visibility = options.visibility === undefined ? document : options.visibility;
    this.#levels = options.levels ?? DEFAULT_MIX;
    this.#now = options.now ?? (() => performance.now());
  }

  get muted(): boolean {
    return this.#muted;
  }

  set muted(muted: boolean) {
    this.#muted = muted;
    this.#engine?.mixer.setMuted(muted);
  }

  /** The audio context once unlocked; for meters and the audio lab. */
  get context(): AudioContext | null {
    return this.#engine?.context ?? null;
  }

  /** Id of the track playing (or waiting for unlock), if any. */
  get currentMusic(): MusicId | null {
    if (!this.#engine) return this.#pending?.id ?? null;
    return (this.#engine.deck.currentId as MusicId | null) ?? null;
  }

  async unlock(): Promise<void> {
    const engine = this.#engine ?? this.#start();
    if (engine && this.#shouldRun() && engine.context.state !== 'running') {
      // Some browsers reject resume() outside a gesture; the next unlock() from a real gesture will succeed.
      await engine.context.resume().catch(() => undefined);
    }
  }

  playMusic(id: MusicId, options: MusicOptions = {}): void {
    const engine = this.#engine;
    if (!engine) {
      this.#pending = { id, options, requestedAt: this.#now() };
      return;
    }
    this.#startTrack(engine.deck, engine.context, id, options, 0);
  }

  stopMusic(options: { readonly fadeOutMs?: number } = {}): void {
    this.#pending = null;
    this.#engine?.deck.stop((options.fadeOutMs ?? 0) / 1000);
  }

  playSfx(id: SfxId, options: SfxOptions = {}): void {
    const engine = this.#engine;
    if (engine?.context.state !== 'running') return;
    engine.sfx.play(id, this.#sfxRecipes[id], options);
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    this.#syncContext();
  }

  /** Also feeds the final mix to `node` (a meter or scope). Returns the disconnect, or `null` before unlock. */
  connectMonitor(node: AudioNode): (() => void) | null {
    return this.#engine?.mixer.connectMonitor(node) ?? null;
  }

  /** Stops everything and releases the context. The service stays silent afterwards. */
  async dispose(): Promise<void> {
    const engine = this.#engine;
    if (!engine) return;
    clearInterval(engine.timer);
    this.#visibility?.removeEventListener('visibilitychange', this.#onVisibilityChange);
    await engine.context.close().catch(() => undefined);
  }

  #start(): Engine | null {
    let context: AudioContext;
    try {
      context = this.#createContext();
    } catch {
      // No usable audio device or too many contexts: the game simply stays silent.
      return null;
    }
    const mixer = new Mixer(context, context.destination, this.#levels);
    mixer.setMuted(this.#muted);
    const deck = new MusicDeck(context, mixer.music);
    const sfx = new SfxPlayer(context, mixer.sfx);
    const timer = window.setInterval(this.#tick, SCHEDULE_INTERVAL_MS);
    const engine: Engine = { context, mixer, deck, sfx, timer };
    this.#engine = engine;
    this.#hidden = this.#visibility?.hidden ?? false;
    this.#visibility?.addEventListener('visibilitychange', this.#onVisibilityChange);

    const pending = this.#pending;
    this.#pending = null;
    if (pending) {
      const elapsed = (this.#now() - pending.requestedAt) / 1000;
      this.#startTrack(deck, context, pending.id, pending.options, elapsed);
    }
    this.#syncContext();
    return engine;
  }

  /** Starts a track; `elapsed` seconds since it was requested lets a one-shot keep its place. */
  #startTrack(deck: MusicDeck, context: AudioContext, id: MusicId, options: MusicOptions, elapsed: number): void {
    const song = this.#song(id);
    const loop = (options.loop ?? true) && song.loopTick !== null;
    const begin = context.currentTime + START_DELAY;
    const join = loop ? 0 : elapsed;
    deck.play(id, song, {
      loop,
      fadeIn: (options.fadeInMs ?? 0) / 1000,
      crossfade: DEFAULT_CROSSFADE,
      startTime: begin - join,
      notBefore: begin,
    });
    this.#tick();
  }

  #song(id: MusicId): CompiledSong {
    let song = this.#compiled.get(id);
    if (!song) {
      song = compileSong(this.#music[id], id);
      this.#compiled.set(id, song);
    }
    return song;
  }

  #shouldRun(): boolean {
    return !this.#paused && !this.#hidden;
  }

  #syncContext(): void {
    const context = this.#engine?.context;
    if (!context || context.state === 'closed') return;
    if (this.#shouldRun() && context.state !== 'running') void context.resume().catch(() => undefined);
    else if (!this.#shouldRun() && context.state === 'running') void context.suspend().catch(() => undefined);
  }

  readonly #tick = (): void => {
    const engine = this.#engine;
    if (!engine || engine.context.state === 'closed') return;
    engine.deck.schedule(engine.context.currentTime + LOOKAHEAD);
    engine.sfx.prune();
  };

  readonly #onVisibilityChange = (): void => {
    this.#hidden = this.#visibility?.hidden ?? false;
    this.#syncContext();
  };
}
