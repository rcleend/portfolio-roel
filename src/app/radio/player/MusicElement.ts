/**
 * The radio's one media element (SPEC §8.3): an `<audio>` that streams the album files,
 * created on the first pick and kept for the page's life. Never routed through Web Audio
 * and never decoded to PCM: the browser streams and decodes, iOS keeps it playing on the
 * lock screen, and an album hosted elsewhere needs no CORS.
 *
 * Its first `play()` runs inside the gesture that picked the disc, silently (volume 0, or
 * muted where volume is read-only, as on iOS), so the stream is buffering while the disc
 * flies into the player; `open` rewinds and fades it in once the disc is seated. Volume
 * ramps are driven by animation frames and happen at once where they cannot.
 */

/** The parts of `HTMLAudioElement` the player uses, so tests can stand one in. */
export interface AudioLike {
  src: string;
  currentTime: number;
  volume: number;
  muted: boolean;
  preload: string;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** What drives a volume ramp: animation frames while the page is visible, nothing while it is hidden. */
export interface FrameClock {
  now(): number;
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
  /** True while frames do not run (a hidden tab): ramps then happen at once. */
  hidden(): boolean;
  /** Runs `callback` after `ms` even when frames stop; returns its cancel. */
  later(callback: () => void, ms: number): () => void;
}

/** What the element reports, in the player's terms. */
export interface MusicListener {
  /** Sound is flowing (also during a silent start). */
  playing(): void;
  time(seconds: number): void;
  ended(): void;
  error(): void;
  /** The browser or the OS paused it (a phone call, a headset unplugged). */
  interrupted(): void;
  /** `play()` was refused: no user activation yet. */
  blocked(): void;
}

export const PAGE_FRAMES: FrameClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  hidden: () => document.visibilityState === 'hidden',
  later: (callback, ms) => {
    const handle = window.setTimeout(callback, ms);
    return () => window.clearTimeout(handle);
  },
};

/** The page's one audio element, made on first use: nothing is requested before a pick. */
let shared: HTMLAudioElement | null = null;
export function pageAudioElement(): HTMLAudioElement {
  shared ??= Object.assign(document.createElement('audio'), { preload: 'none' });
  return shared;
}

const ELEMENT_EVENTS = ['playing', 'timeupdate', 'ended', 'error', 'pause'] as const;

export class MusicElement {
  readonly #create: () => AudioLike;
  readonly #frames: FrameClock;
  readonly #listener: MusicListener;
  #element: AudioLike | null = null;
  #writable = true;
  #siteMuted = false;
  /** Started silently and not opened yet. */
  #silent = false;
  /** Whether it should be playing: a pause while this is false is ours. */
  #wanted = false;
  #source: string | null = null;
  #ramp: number | null = null;
  #rampDeadline: (() => void) | null = null;
  /** Where the running ramp is heading. */
  #rampTo = 0;
  /** The source a swap's fade-out will start; the seat may come first (reduced motion, a hidden page). */
  #swapTo: string | null = null;
  readonly #handlers: Readonly<Record<(typeof ELEMENT_EVENTS)[number], () => void>>;

  constructor(listener: MusicListener, create: () => AudioLike = pageAudioElement, frames: FrameClock = PAGE_FRAMES) {
    this.#listener = listener;
    this.#create = create;
    this.#frames = frames;
    this.#handlers = {
      playing: () => this.#listener.playing(),
      timeupdate: () => {
        // A silent start and a pause of ours (the last tick of an old track) are not the player's time.
        if (this.#element && !this.#silent && this.#wanted) this.#listener.time(this.#element.currentTime);
      },
      ended: () => {
        this.#wanted = false;
        this.#listener.ended();
      },
      error: () => this.#listener.error(),
      pause: () => {
        if (!this.#wanted || this.#element?.ended) return;
        this.#wanted = false;
        this.#listener.interrupted();
      },
    };
  }

  /** The element, once a disc has been picked. */
  get element(): AudioLike | null {
    return this.#element;
  }

  /** The URL it holds, or null before the first pick. */
  get source(): string | null {
    return this.#source;
  }

  /** False where `volume` cannot be set (iOS): fades are then instant and silence is `muted`. */
  get volumeWritable(): boolean {
    return this.#writable;
  }

  /** Starts `url` with no sound, at once: call it synchronously inside the gesture that picked the disc. */
  startSilently(url: string): void {
    const element = this.#ensure();
    this.#stopRamp();
    this.#swapTo = null;
    this.#silent = true;
    this.#load(url, 0);
    if (this.#writable) {
      element.volume = 0;
      element.muted = this.#siteMuted;
    } else {
      element.muted = true;
    }
    this.#play();
  }

  /** Fades the playing disc out over `ms`, then starts `url` silently (the element is already allowed to play). */
  swapSilently(url: string, ms: number): void {
    // Remembered before the fade, which ends at once where volume is read-only (iOS) and then starts `url` itself.
    this.#swapTo = url;
    this.#fade(0, ms, () => this.startSilently(url));
  }

  /**
   * The disc is seated: from the top, fading in to `volume` over `ms`. A swap whose fade-out is still running
   * (the seat came at once) skips the rest of it: the new disc is the one that opens.
   */
  open(volume: number, ms: number): void {
    if (this.#swapTo !== null) this.startSilently(this.#swapTo);
    const element = this.#element;
    if (!element) return;
    this.#stopRamp();
    element.currentTime = 0;
    this.#silent = false;
    element.muted = this.#siteMuted;
    if (this.#writable) {
      element.volume = 0;
      this.#fade(volume, ms);
    }
  }

  /** Plays `url` from `at` seconds, sound first, fading in to `volume` over `ms` (0: at once). */
  play(url: string, at: number, volume: number, ms: number): void {
    const element = this.#ensure();
    this.#stopRamp();
    this.#swapTo = null;
    if (this.#source !== url) this.#load(url, at);
    else if (this.#silent || Math.abs(element.currentTime - at) > 1) element.currentTime = at;
    this.#silent = false;
    element.muted = this.#siteMuted;
    if (this.#writable) {
      element.volume = ms > 0 ? 0 : volume;
      this.#fade(volume, ms);
    }
    this.#play();
  }

  /** Fades out over `ms`, then pauses where it is. */
  pause(ms: number): void {
    if (!this.#element) return;
    this.#wanted = false;
    this.#fade(0, ms, () => this.#pauseNow());
  }

  /** Silence now: the track is about to change. */
  quiet(): void {
    this.#stopRamp();
    this.#swapTo = null;
    this.#pauseNow();
  }

  /** The perspective changed (the camera moved): glide to `volume` over `ms` while it plays. */
  setVolume(volume: number, ms: number): void {
    // Silent, paused or fading out: the next open or play uses the new volume.
    if (!this.#element || this.#silent || !this.#wanted || (this.#ramp !== null && this.#rampTo === 0)) return;
    this.#fade(volume, ms);
  }

  /** The site's sound preference. A silent start stays silent until it is opened. */
  setMuted(muted: boolean): void {
    this.#siteMuted = muted;
    if (this.#element) this.#element.muted = muted || (this.#silent && !this.#writable);
  }

  /** Stops listening and pauses; the element itself stays for the page. */
  dispose(): void {
    this.#stopRamp();
    const element = this.#element;
    if (!element) return;
    this.#pauseNow();
    for (const type of ELEMENT_EVENTS) element.removeEventListener(type, this.#handlers[type]);
    this.#element = null;
  }

  #ensure(): AudioLike {
    if (this.#element) return this.#element;
    const element = this.#create();
    element.preload = 'auto';
    // iOS ignores volume writes: read one back to know.
    element.volume = 0.5;
    this.#writable = Math.abs(element.volume - 0.5) < 0.01;
    element.volume = 1;
    for (const type of ELEMENT_EVENTS) element.addEventListener(type, this.#handlers[type]);
    this.#element = element;
    return element;
  }

  #load(url: string, at: number): void {
    const element = this.#ensure();
    this.#source = url;
    element.src = url;
    if (at > 0) {
      // A new source forgets a position set before its metadata: seek once it is known.
      const seek = (): void => {
        element.removeEventListener('loadedmetadata', seek);
        if (this.#source === url) element.currentTime = at;
      };
      element.addEventListener('loadedmetadata', seek);
    }
  }

  #play(): void {
    const element = this.#element;
    if (!element) return;
    this.#wanted = true;
    element.play().catch((error: unknown) => {
      // A newer source or a pause cancels a pending play (AbortError): not a refusal.
      if (error instanceof Error && error.name === 'NotAllowedError' && this.#element === element) {
        this.#wanted = false;
        this.#listener.blocked();
      }
    });
  }

  #pauseNow(): void {
    this.#wanted = false;
    if (this.#element && !this.#element.paused) this.#element.pause();
  }

  /** Ramps the volume to `to` over `ms`; at once where volume is read-only, the page hidden or `ms` is 0. */
  #fade(to: number, ms: number, done?: () => void): void {
    this.#stopRamp();
    const element = this.#element;
    if (!element) return;
    if (!this.#writable || ms <= 0 || this.#frames.hidden()) {
      if (this.#writable) element.volume = to;
      done?.();
      return;
    }
    const from = element.volume;
    const start = this.#frames.now();
    this.#rampTo = to;
    const finish = (): void => {
      this.#stopRamp();
      element.volume = to;
      done?.();
    };
    const step = (now: number): void => {
      const t = (now - start) / ms;
      if (t >= 1) {
        finish();
        return;
      }
      // Smoothstep: no click at either end.
      const eased = Math.max(0, t) ** 2 * (3 - 2 * Math.max(0, t));
      element.volume = from + (to - from) * eased;
      this.#ramp = this.#frames.request(step);
    };
    this.#ramp = this.#frames.request(step);
    // Frames stop when the tab is hidden mid-fade: the fade (and the pause after it) still ends on time.
    this.#rampDeadline = this.#frames.later(finish, ms + 50);
  }

  #stopRamp(): void {
    if (this.#ramp !== null) this.#frames.cancel(this.#ramp);
    this.#ramp = null;
    this.#rampDeadline?.();
    this.#rampDeadline = null;
  }
}
