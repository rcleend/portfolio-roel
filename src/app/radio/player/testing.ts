import type { DeckState, FramingInsets, RadioCueEvent, RadioDeck, RadioIntent, RadioKey, RadioLayout } from '../deck';
import type { AudioLike, FrameClock } from './MusicElement';

/**
 * Stand-ins for the player's unit tests: an audio element, a frame clock, timers and a
 * deck that record what they are asked to do. Test support only; nothing imports it.
 */

/** An audio element that plays at once (or refuses, with `refuse`) and records every call. */
export class FakeAudio implements AudioLike {
  /** Every source assigned, in order: each one is a new request for the browser. */
  readonly sources: string[] = [];
  currentTime = 0;
  muted = false;
  preload = 'none';
  paused = true;
  ended = false;
  /** Set to an error name ('NotAllowedError', 'AbortError') to make the next `play()` reject with it. */
  refuse: string | null = null;
  readonly log: string[] = [];
  readonly #writable: boolean;
  #volume = 1;
  #src = '';
  readonly #listeners = new Map<string, Set<() => void>>();

  constructor(options: { readonly writableVolume?: boolean } = {}) {
    this.#writable = options.writableVolume ?? true;
  }

  get src(): string {
    return this.#src;
  }

  set src(url: string) {
    this.#src = url;
    this.sources.push(url);
  }

  get volume(): number {
    return this.#volume;
  }

  /** Like iOS, a read-only element ignores volume writes. */
  set volume(value: number) {
    if (this.#writable) this.#volume = value;
  }

  play(): Promise<void> {
    this.log.push(`play ${this.src}`);
    const refusal = this.refuse;
    if (refusal) {
      this.refuse = null;
      return Promise.reject(new DOMException('refused', refusal));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.log.push('pause');
    this.emit('pause');
  }

  addEventListener(type: string, listener: () => void): void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) listener();
  }

  listenerCount(): number {
    let count = 0;
    for (const set of this.#listeners.values()) count += set.size;
    return count;
  }

  /** The browser plays on to `seconds` and says so. */
  advanceTo(seconds: number): void {
    this.currentTime = seconds;
    this.emit('timeupdate');
  }
}

/** Animation frames on demand: `tick(ms)` moves time on and runs what was requested; `stall(ms)` lets time pass without frames. */
export class FakeFrames implements FrameClock {
  time = 0;
  isHidden = false;
  #next = 1;
  #pending = new Map<number, (now: number) => void>();
  #timers = new Map<number, { readonly at: number; readonly callback: () => void }>();

  now(): number {
    return this.time;
  }

  request(callback: (now: number) => void): number {
    const handle = this.#next++;
    this.#pending.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.#pending.delete(handle);
  }

  hidden(): boolean {
    return this.isHidden;
  }

  later(callback: () => void, ms: number): () => void {
    const handle = this.#next++;
    this.#timers.set(handle, { at: this.time + ms, callback });
    return () => this.#timers.delete(handle);
  }

  /** Runs frames 16 ms apart until `ms` have passed (and any timer that falls due). */
  tick(ms: number): void {
    this.#pass(ms, true);
  }

  /** Lets `ms` pass with no frames, as in a hidden tab: only timers run. */
  stall(ms: number): void {
    this.#pass(ms, false);
  }

  #pass(ms: number, frames: boolean): void {
    const end = this.time + ms;
    while (this.time < end) {
      this.time = Math.min(end, this.time + 16);
      for (const [handle, timer] of [...this.#timers]) {
        if (timer.at > this.time) continue;
        this.#timers.delete(handle);
        timer.callback();
      }
      if (!frames) continue;
      const due = [...this.#pending];
      this.#pending.clear();
      for (const [, callback] of due) callback(this.time);
    }
  }
}

/** `setTimeout` on a clock the test moves. */
export class FakeTimers {
  time = 0;
  #next = 1;
  readonly #pending = new Map<number, { readonly at: number; readonly callback: () => void }>();

  set = (callback: () => void, ms: number): number => {
    const handle = this.#next++;
    this.#pending.set(handle, { at: this.time + ms, callback });
    return handle;
  };

  clear = (handle: number): void => {
    this.#pending.delete(handle);
  };

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.#pending].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.#pending.delete(due[0]);
      this.time = due[1].at;
      due[1].callback();
    }
    this.time = end;
  }
}

const NO_RECT = { left: 0, top: 0, width: 0, height: 0 };

/** A deck without a room: records `setState` and `press`, and lets the test play the room's part. */
export class RecordingDeck implements RadioDeck {
  readonly available = true;
  readonly labelSize = 384;
  readonly controls = {} as HTMLElement;
  readonly layout: RadioLayout = {
    discs: [],
    keys: { 'play-pause': NO_RECT, stop: NO_RECT, previous: NO_RECT, next: NO_RECT },
  };
  live = false;
  readonly states: DeckState[] = [];
  readonly presses: RadioKey[] = [];
  /** Every call in order, for checks that one thing happened before another. */
  readonly log: string[] = [];
  readonly #intents = new Set<(intent: RadioIntent) => void>();
  readonly #seated = new Set<(disc: string) => void>();
  readonly #cues = new Set<(event: RadioCueEvent) => void>();

  get state(): DeckState | undefined {
    return this.states.at(-1);
  }

  setState(state: DeckState): void {
    this.states.push(state);
    this.log.push(`setState ${state.loaded} ${state.transport} ${state.lcd.kind}`);
  }

  press(key: RadioKey): void {
    this.presses.push(key);
    this.log.push(`press ${key}`);
  }

  onIntent(listener: (intent: RadioIntent) => void): () => void {
    this.#intents.add(listener);
    return () => this.#intents.delete(listener);
  }

  onSeated(listener: (disc: string) => void): () => void {
    this.#seated.add(listener);
    return () => this.#seated.delete(listener);
  }

  onCue(listener: (event: RadioCueEvent) => void): () => void {
    this.#cues.add(listener);
    return () => this.#cues.delete(listener);
  }

  /** The visitor clicks the model. */
  intent(intent: RadioIntent): void {
    this.log.push(`intent ${intent.type}`);
    for (const listener of this.#intents) listener(intent);
  }

  /** The disc lands and ▷II goes down. */
  seat(disc: string): void {
    for (const listener of this.#seated) listener(disc);
  }

  cue(event: RadioCueEvent): void {
    for (const listener of this.#cues) listener(event);
  }

  onAvailableChange(): () => void {
    return () => undefined;
  }
  prefetch(): void {}
  setDiscs(): void {}
  setAttention(): void {}
  onAttentionChange(): () => void {
    return () => undefined;
  }
  onLiveChange(): () => void {
    return () => undefined;
  }
  onLayoutChange(): () => void {
    return () => undefined;
  }
  setControlInsets(_insets: FramingInsets): void {}
}
