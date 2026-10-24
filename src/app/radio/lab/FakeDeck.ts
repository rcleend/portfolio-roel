import type {
  DeckState,
  DiscAnchor,
  DiscArt,
  FramingInsets,
  LcdReadout,
  RadioCue,
  RadioCueEvent,
  RadioDeck,
  RadioIntent,
  RadioKey,
  RadioLayout,
  ScreenRect,
} from '../deck';

/** Everything the player asked of the deck (and the lab did to it), in order, for the end-to-end checks. */
export interface LabEvent {
  readonly type:
    | 'setState'
    | 'setDiscs'
    | 'press'
    | 'intent'
    | 'seated'
    | 'cue'
    | 'attention'
    | 'insets'
    | 'prefetch'
    | 'live'
    | 'leave'
    | 'focusStage';
  /** `performance.now()` when it happened. */
  readonly at: number;
  readonly detail?: unknown;
}

/** The room's insert, as the storyboard times it (SPEC §3.6): ▷II reaches the bottom 890 ms after the pick. */
export const SEAT_MS = 890;
const INSERT_CUES: readonly (readonly [number, RadioCue])[] = [
  [0, 'disc-pick'],
  [770, 'disc-seat'],
  [840, 'key-down'],
  [SEAT_MS, 'key-up'],
  [SEAT_MS, 'spin-up'],
];
/** What still sounds under reduced motion: state changes only (SPEC §3.3). */
const STATE_CUES: ReadonlySet<RadioCue> = new Set(['lid-unlatch', 'lid-latch', 'disc-seat', 'key-down', 'key-up']);
const NO_INSETS: FramingInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const KEYS: readonly RadioKey[] = ['previous', 'play-pause', 'stop', 'next'];

/**
 * A stand-in for the room's CD player (`room.radio`) for building the player without
 * three.js (radio-lab.html): it draws the radio, its keys and the floating discs in the
 * DOM where the room would project them, turns clicks on them into the intents the room
 * would emit, seats a picked disc 890 ms after the answering `setState` (in a microtask
 * under reduced motion), emits the mechanical cues on the room's timetable and records
 * everything it is asked to do.
 */
export class FakeDeck implements RadioDeck {
  readonly available = true;
  readonly labelSize = 384;
  readonly controls: HTMLElement;
  readonly events: LabEvent[] = [];
  readonly #stage: HTMLElement;
  readonly #body: HTMLElement;
  readonly #lcd: HTMLElement;
  readonly #well: HTMLElement;
  readonly #keys = new Map<RadioKey, HTMLElement>();
  readonly #discElements = new Map<string, HTMLElement>();
  #discs: readonly DiscArt[] = [];
  #state: DeckState = { loaded: null, transport: 'stopped', lcd: { kind: 'off' } };
  #layout: RadioLayout;
  #insets: FramingInsets = NO_INSETS;
  #live = false;
  #keyboard: string | null = null;
  #pointer: string | null = null;
  #attention: string | null = null;
  #pressedDisc: string | null = null;
  #seatTimers: number[] = [];
  readonly #listeners = {
    attention: new Set<(disc: string | null) => void>(),
    intent: new Set<(intent: RadioIntent) => void>(),
    seated: new Set<(disc: string) => void>(),
    cue: new Set<(event: RadioCueEvent) => void>(),
    live: new Set<(live: boolean) => void>(),
    layout: new Set<(layout: RadioLayout) => void>(),
  };

  constructor(stage: HTMLElement, overlay: HTMLElement) {
    this.#stage = stage;
    this.#body = element('div', 'fake-radio', stage);
    this.#lcd = element('div', 'fake-radio__lcd', this.#body);
    this.#well = element('div', 'fake-well', stage);
    for (const key of KEYS) {
      const node = element('div', 'fake-key', stage);
      node.dataset.key = key;
      node.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.#animateKey(key);
        this.#emitIntent({ type: 'press', key });
      });
      this.#keys.set(key, node);
    }
    this.#well.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.#state.loaded === null) return;
      this.#animateKey('play-pause');
      this.#emitIntent({ type: 'press', key: 'play-pause' });
    });
    this.controls = element('div', 'fake-controls', overlay);
    this.#applyLive();
    this.#layout = this.#computeLayout();
    window.addEventListener('resize', () => this.#relayout());
  }

  get live(): boolean {
    return this.#live;
  }

  get layout(): RadioLayout {
    return this.#layout;
  }

  get state(): DeckState {
    return this.#state;
  }

  onAvailableChange(): () => void {
    return () => undefined;
  }

  prefetch(reason: 'idle' | 'intent'): void {
    this.#log('prefetch', reason);
  }

  setDiscs(discs: readonly DiscArt[]): void {
    this.#log(
      'setDiscs',
      discs.map((disc) => ({ id: disc.id, label: disc.label !== null })),
    );
    this.#discs = discs;
    for (const disc of discs) this.#discElement(disc.id, disc.label);
    for (const [id, node] of this.#discElements) if (!discs.some((disc) => disc.id === id)) node.remove();
    this.#relayout();
  }

  setState(state: DeckState): void {
    const previous = this.#state;
    this.#state = state;
    this.#log('setState', state);
    this.#lcd.textContent = lcdText(state.lcd);
    this.#lcd.dataset.kind = state.lcd.kind;
    if (state.loaded !== previous.loaded) {
      this.#insert(state.loaded, previous);
      this.#relayout();
    } else if (state.loaded !== null && state.transport !== previous.transport) {
      this.#cue(state.transport === 'playing' ? 'spin-up' : 'spin-down');
    }
    this.#paintDiscs();
  }

  press(key: RadioKey): void {
    this.#log('press', key);
    this.#animateKey(key);
  }

  setAttention(disc: string | null): void {
    this.#keyboard = disc;
    this.#updateAttention();
  }

  onAttentionChange(listener: (disc: string | null) => void): () => void {
    return subscribe(this.#listeners.attention, listener);
  }

  onIntent(listener: (intent: RadioIntent) => void): () => void {
    return subscribe(this.#listeners.intent, listener);
  }

  onSeated(listener: (disc: string) => void): () => void {
    return subscribe(this.#listeners.seated, listener);
  }

  onCue(listener: (event: RadioCueEvent) => void): () => void {
    return subscribe(this.#listeners.cue, listener);
  }

  onLiveChange(listener: (live: boolean) => void): () => void {
    return subscribe(this.#listeners.live, listener);
  }

  onLayoutChange(listener: (layout: RadioLayout) => void): () => void {
    return subscribe(this.#listeners.layout, listener);
  }

  setControlInsets(insets: FramingInsets): void {
    if (sameInsets(insets, this.#insets)) return;
    this.#insets = insets;
    this.#log('insets', insets);
    this.#relayout();
  }

  // ── The lab's half: the camera and a visitor without a gesture ─────────────────

  /** The camera lands: the controls go live (the room's `revealRadio`). */
  reveal(): void {
    if (this.#live) return;
    this.#live = true;
    this.#applyLive();
    this.#log('live', true);
    for (const listener of this.#listeners.live) listener(true);
    this.#discs.forEach((_, index) => {
      this.#cueLater(37 + index * 60, 'disc-rise', index);
      this.#cueLater(37 + index * 60 + 330, 'disc-flip', index);
    });
  }

  /** The camera is asked to leave: the controls hide at once (the room's `concealRadio`). */
  conceal(): void {
    if (!this.#live) return;
    this.#live = false;
    this.#applyLive();
    this.#log('live', false);
    for (const listener of this.#listeners.live) listener(false);
    this.#discs.forEach((_, index) => {
      this.#cueLater(index * 45 + 340, 'disc-sink', index);
    });
    this.#cueLater(660, 'lid-close');
    this.#cueLater(1000, 'lid-latch');
  }

  /** The flight to the radio: the lid's cues on the room's timetable (SPEC §3.2). */
  approach(): void {
    if (this.#state.lcd.kind === 'off') this.#cue('power-on');
    this.#cueLater(700, 'lid-push');
    this.#cueLater(780, 'lid-unlatch');
    this.#cueLater(840, 'lid-swing');
    this.#cueLater(1309, 'lid-stop');
  }

  /** An intent that no gesture caused (the autoplay-policy check). */
  emitIntent(intent: RadioIntent): void {
    this.#emitIntent(intent);
  }

  log(type: LabEvent['type'], detail?: unknown): void {
    this.#log(type, detail);
  }

  // ── Inside ─────────────────────────────────────────────────────────────────────

  #emitIntent(intent: RadioIntent): void {
    this.#log('intent', intent);
    for (const listener of this.#listeners.intent) listener(intent);
  }

  /** A disc goes in: seated at the bottom of the ▷II press, or at once where nothing animates. */
  #insert(disc: string | null, previous: DeckState): void {
    for (const timer of this.#seatTimers) window.clearTimeout(timer);
    this.#seatTimers = [];
    if (disc === null) return;
    if (reducedMotion() || !this.#live) {
      queueMicrotask(() => {
        if (this.#state.loaded !== disc) return;
        for (const [, cue] of INSERT_CUES) if (STATE_CUES.has(cue)) this.#cue(cue);
        this.#seat(disc);
      });
      return;
    }
    if (previous.loaded !== null) {
      this.#cue('spin-down');
      this.#seatTimers.push(window.setTimeout(() => this.#cue('disc-unseat'), 300));
    }
    for (const [at, cue] of INSERT_CUES) this.#seatTimers.push(window.setTimeout(() => this.#cue(cue), at));
    this.#seatTimers.push(window.setTimeout(() => this.#seat(disc), SEAT_MS));
  }

  #seat(disc: string): void {
    if (this.#state.loaded !== disc) return;
    this.#log('seated', disc);
    for (const listener of this.#listeners.seated) listener(disc);
    this.#paintDiscs();
  }

  #cue(cue: RadioCue, order?: number): void {
    if (reducedMotion() && !STATE_CUES.has(cue)) return;
    const event: RadioCueEvent = order === undefined ? { cue, pan: 0 } : { cue, pan: 0, order };
    this.#log('cue', event);
    for (const listener of this.#listeners.cue) listener(event);
  }

  #cueLater(ms: number, cue: RadioCue, order?: number): void {
    window.setTimeout(() => this.#cue(cue, order), ms);
  }

  #animateKey(key: RadioKey): void {
    const node = this.#keys.get(key);
    if (!node) return;
    node.dataset.pressed = 'true';
    window.setTimeout(() => delete node.dataset.pressed, 140);
    this.#cue('key-down');
    window.setTimeout(() => this.#cue('key-up'), 60);
  }

  #discElement(id: string, label: DiscArt['label']): HTMLElement {
    let node = this.#discElements.get(id);
    if (!node) {
      const created = element('div', 'fake-disc', this.#stage);
      created.dataset.disc = id;
      element('canvas', 'fake-disc__print', created);
      created.addEventListener('pointerenter', () => this.#hover(id));
      created.addEventListener('pointerleave', () => this.#hover(null));
      created.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.#pressedDisc = id;
        this.#hover(id);
      });
      created.addEventListener('pointerup', (event) => {
        event.stopPropagation();
        const picked = this.#pressedDisc === id;
        this.#pressedDisc = null;
        // The loaded disc spins in the well: a click there is ▷II, not a pick.
        if (!picked) return;
        if (this.#state.loaded === id) {
          this.#animateKey('play-pause');
          this.#emitIntent({ type: 'press', key: 'play-pause' });
        } else {
          this.#emitIntent({ type: 'pick', disc: id });
        }
      });
      this.#discElements.set(id, created);
      node = created;
    }
    const canvas = node.querySelector('canvas');
    if (canvas && label) {
      canvas.width = 192;
      canvas.height = 192;
      canvas.getContext('2d')?.drawImage(label, 0, 0, 192, 192);
    }
    return node;
  }

  #hover(disc: string | null): void {
    this.#pointer = disc;
    this.#updateAttention();
  }

  #updateAttention(): void {
    const attention = this.#pointer ?? this.#keyboard;
    if (attention === this.#attention) return;
    this.#attention = attention;
    this.#log('attention', attention);
    for (const listener of this.#listeners.attention) listener(attention);
    this.#paintDiscs();
  }

  #applyLive(): void {
    Object.assign(this.controls.style, {
      visibility: this.#live ? 'visible' : 'hidden',
      pointerEvents: this.#live ? '' : 'none',
    });
    this.controls.dataset.live = String(this.#live);
    document.body.dataset.live = String(this.#live);
  }

  #relayout(): void {
    this.#layout = this.#computeLayout();
    this.#paintDiscs();
    for (const listener of this.#listeners.layout) listener(this.#layout);
  }

  /** Where the room would project the radio and the discs: an arc over the well, or a stack on portrait screens. */
  #computeLayout(): RadioLayout {
    const { top, right, bottom, left } = this.#insets;
    const width = window.innerWidth - left - right;
    const height = window.innerHeight - top - bottom;
    const portrait = width / height < 0.9;
    const bodyWidth = Math.min(640, width * (portrait ? 0.9 : 0.5));
    const bodyHeight = bodyWidth * 0.34;
    const body: ScreenRect = {
      left: left + (width - bodyWidth) / 2 - (portrait ? 0 : bodyWidth * 0.12),
      top: top + height * (portrait ? 0.7 : 0.6),
      width: bodyWidth,
      height: bodyHeight,
    };
    const seat = { x: body.left + bodyWidth * 0.68, y: body.top + bodyHeight * 0.16 };
    const count = Math.max(1, this.#discs.length);
    const anchors: DiscAnchor[] = [];
    const floating = this.#discs.filter((disc) => disc.id !== this.#state.loaded);
    if (portrait) {
      const radius = Math.min(width * 0.2, (body.top - top - 40) / (Math.ceil(count / 2) * 2.4));
      floating.forEach((disc, index) => {
        const row = Math.floor(index / 2);
        const lastRowAlone = index === floating.length - 1 && floating.length % 2 === 1;
        const column = lastRowAlone ? 0.5 : index % 2;
        anchors.push({
          disc: disc.id,
          x: left + width / 2 + (column - 0.5) * radius * 2.3,
          y: body.top - radius * 1.25 - row * radius * 2.3,
          radius,
          inPlayer: false,
        });
      });
    } else {
      const radius = Math.min(bodyWidth * 0.15, (width * 0.86) / (count * 2.3));
      const span = radius * 2.3 * (count - 1);
      const centre = Math.min(Math.max(seat.x, left + span / 2 + radius * 1.2), left + width - span / 2 - radius * 1.2);
      this.#discs.forEach((disc, index) => {
        if (disc.id === this.#state.loaded) return;
        const u = count === 1 ? 0 : index / (count - 1) - 0.5;
        anchors.push({
          disc: disc.id,
          x: centre + u * span,
          y: body.top - radius * 1.5 - radius * 0.9 * u * u,
          radius,
          inPlayer: false,
        });
      });
    }
    if (this.#state.loaded !== null) {
      anchors.push({ disc: this.#state.loaded, x: seat.x, y: seat.y, radius: bodyWidth * 0.11, inPlayer: true });
    }
    const keyWidth = bodyWidth * 0.045;
    const keyTop = body.top + bodyHeight * 0.52;
    const rocker = { left: body.left + bodyWidth * 0.6, width: keyWidth * 1.3 };
    const keys: Record<RadioKey, ScreenRect> = {
      'play-pause': { left: rocker.left, top: keyTop, width: rocker.width, height: keyWidth * 1.1 },
      stop: { left: rocker.left, top: keyTop + keyWidth * 1.1, width: rocker.width, height: keyWidth * 1.1 },
      previous: {
        left: rocker.left - keyWidth * 1.4,
        top: keyTop + keyWidth * 0.5,
        width: keyWidth,
        height: keyWidth * 1.2,
      },
      next: {
        left: rocker.left + rocker.width + keyWidth * 0.4,
        top: keyTop + keyWidth * 0.5,
        width: keyWidth,
        height: keyWidth * 1.2,
      },
    };
    this.#place(body, seat, bodyWidth * 0.11, keys);
    return { discs: anchors, keys };
  }

  #place(
    body: ScreenRect,
    seat: { x: number; y: number },
    wellRadius: number,
    keys: Record<RadioKey, ScreenRect>,
  ): void {
    Object.assign(this.#body.style, rectCss(body));
    Object.assign(
      this.#well.style,
      rectCss({
        left: seat.x - wellRadius,
        top: seat.y - wellRadius * 0.42,
        width: wellRadius * 2,
        height: wellRadius * 0.84,
      }),
    );
    for (const [key, rect] of Object.entries(keys))
      Object.assign(this.#keys.get(key as RadioKey)?.style ?? {}, rectCss(rect));
  }

  #paintDiscs(): void {
    for (const [id, node] of this.#discElements) {
      const anchor = this.#layout?.discs.find((candidate) => candidate.disc === id);
      if (!anchor) continue;
      const attended = this.#attention === id && !anchor.inPlayer;
      const size = anchor.radius * 2 * (attended ? 1.06 : 1);
      Object.assign(node.style, {
        width: `${size}px`,
        height: `${anchor.inPlayer ? size * 0.42 : size}px`,
        transform: `translate(${anchor.x - size / 2}px, ${anchor.y - (anchor.inPlayer ? size * 0.21 : size / 2) - (attended ? 8 : 0)}px)`,
      });
      node.dataset.inPlayer = String(anchor.inPlayer);
      node.dataset.spinning = String(anchor.inPlayer && this.#state.transport === 'playing');
      node.dataset.attended = String(attended);
    }
  }

  #log(type: LabEvent['type'], detail?: unknown): void {
    this.events.push(detail === undefined ? { type, at: performance.now() } : { type, at: performance.now(), detail });
  }
}

/**
 * The segment display as text, the way the room's LCD spells it (ASCII for the play and pause icons: a first
 * fallback-font lookup for ▶ costs a long layout on a slow CPU, which the lab would then measure as the player's).
 */
export function lcdText(readout: LcdReadout): string {
  const two = (value: number): string => String(Math.min(99, value)).padStart(2, '0');
  const clock = (seconds: number): string => `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`;
  switch (readout.kind) {
    case 'off':
      return '';
    case 'no-disc':
      return 'no dISC';
    case 'reading':
      return '-- --:--';
    case 'track':
      return `${{ playing: '>', paused: '||', stopped: ' ' }[readout.transport]} ${two(readout.track)} ${clock(readout.seconds)}`;
    case 'total':
      return `${two(readout.tracks)} ${clock(readout.seconds)}`;
    case 'error':
      return '00 -- --';
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

function rectCss(rect: ScreenRect): Partial<CSSStyleDeclaration> {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}

function subscribe<T>(set: Set<T>, listener: T): () => void {
  set.add(listener);
  return () => set.delete(listener);
}

function sameInsets(a: FramingInsets, b: FramingInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
