import { type FramingInsets, NO_INSETS } from '../camera/CameraRig';
import type { ControlsLayer } from './ControlsLayer';
import type { CreateRadioDevice, RadioDevice, RadioHost } from './deviceContract';
import { deviceMemory, saveData } from './deviceFacts';
import { discSlots, labelSizeFor, largestDiscDiameter, MAX_DISCS, MIN_DISCS } from './discLayout';
import type { DeckState, DiscArt, RadioCueEvent, RadioDeck, RadioIntent, RadioKey, RadioLayout } from './RadioDeck';
import { UNAVAILABLE_WARNING } from './RadioDoor';
import { RadioParts } from './RadioParts';
import { radioPoseSolver } from './radioFraming';

/** Makes the device (deckChunk.ts › loadDevice); a seam for tests. */
export type DeviceLoader = CreateRadioDevice;

/** The label size before the room is ready, when nothing is known of the screen at the radio. */
const DEFAULT_LABEL_SIZE = 384;
/** Five plain silver discs until the app hands over its collection. */
export const DEFAULT_DISCS: readonly DiscArt[] = [1, 2, 3, 4, 5].map((n) => ({ id: `disc-${n}`, label: null }));
export const DEFAULT_DECK_STATE: DeckState = { loaded: null, transport: 'stopped', lcd: { kind: 'off' } };
const NO_RECT = { left: 0, top: 0, width: 0, height: 0 };
const EMPTY_LAYOUT: RadioLayout = {
  discs: [],
  keys: { 'play-pause': NO_RECT, stop: NO_RECT, previous: NO_RECT, next: NO_RECT },
};

/** A set of listeners and the way to call them. */
class Emitter<T> {
  readonly #listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of this.#listeners) listener(value);
  }

  clear(): void {
    this.#listeners.clear();
  }
}

/**
 * The CD player as the app drives it (`room.radio.load()`), in the radio's lazy chunk (deckChunk.ts), which
 * RadioDoor imports as the camera first leaves the TV, before anything at the radio can be asked for. It remembers the app's discs and
 * state and passes them to the device once that exists. It owns the listeners, `live`, `available`, the label size
 * and the camera's radio framing, and makes the device on a prefetch or the approach; the device lays
 * the discs and keys out on the page and publishes that here.
 */
export class RadioDeckHandle implements RadioDeck {
  #discs: readonly DiscArt[] = DEFAULT_DISCS;
  #state: DeckState = DEFAULT_DECK_STATE;
  #keyboard: string | null = null;
  #pointer: string | null = null;
  #attention: string | null = null;
  #insets: FramingInsets = NO_INSETS;
  #isAvailable = true;
  /** Fixed on the first read once the room is ready; null until then. */
  #size: 256 | 384 | 512 | null = null;
  #current: RadioLayout = EMPTY_LAYOUT;
  #discsOut = false;
  /** The disc a `seated` was last told for, until another is loaded: a disc is seated once per insert. */
  #seatedFor: string | null = null;
  #host: RadioHost | null = null;
  #device: RadioDevice | null = null;
  #loading = false;
  #wanted = false;
  /** An approach the device has not seen yet (it was still loading): its start time. */
  #pendingApproach: number | null = null;
  readonly #availability = new Emitter<boolean>();
  readonly #attentions = new Emitter<string | null>();
  readonly #intents = new Emitter<RadioIntent>();
  readonly #seats = new Emitter<string>();
  readonly #cues = new Emitter<RadioCueEvent>();
  readonly #layouts = new Emitter<RadioLayout>();
  readonly #shelf = new Emitter<boolean>();

  readonly #layer: ControlsLayer;
  readonly #reducedMotion: MediaQueryList;
  readonly #loadDeviceChunk: DeviceLoader;
  /** The radio view's half of the radio's click target: the device's parts under the pointer. */
  readonly parts = new RadioParts(() => this.#device);

  constructor(layer: ControlsLayer, reducedMotion: MediaQueryList, loadDeviceChunk: DeviceLoader) {
    this.#layer = layer;
    this.#reducedMotion = reducedMotion;
    this.#loadDeviceChunk = loadDeviceChunk;
  }

  get available(): boolean {
    return this.#isAvailable;
  }

  /**
   * From the largest disc at the radio, read once the room is ready and fixed from then on. Solved on that first
   * read (the app's prints, at idle) rather than when the room is ready, which is the first frame's time.
   */
  get labelSize(): 256 | 384 | 512 {
    if (this.#size !== null) return this.#size;
    const host = this.#host;
    if (!host) return DEFAULT_LABEL_SIZE;
    const { size, softwareGpu } = host.stage;
    const slots = discSlots(this.#discs.length, size.width / size.height);
    this.#size = labelSizeFor(
      largestDiscDiameter(slots, host.rig.viewpoint('radio'), size),
      size.pixelRatio,
      deviceMemory(),
      softwareGpu,
    );
    return this.#size;
  }

  get controls(): HTMLElement {
    return this.#layer.element;
  }

  get live(): boolean {
    return this.#layer.live;
  }

  get layout(): RadioLayout {
    return this.#current;
  }

  get discsOut(): boolean {
    return this.#discsOut;
  }

  /** The device once it is loaded, cut and prepared (for stats and background work); null before. */
  get prepared(): RadioDevice | null {
    return this.#device;
  }

  onAvailableChange(listener: (available: boolean) => void): () => void {
    return this.#availability.on(listener);
  }

  onAttentionChange(listener: (disc: string | null) => void): () => void {
    return this.#attentions.on(listener);
  }

  onIntent(listener: (intent: RadioIntent) => void): () => void {
    return this.#intents.on(listener);
  }

  onSeated(listener: (disc: string) => void): () => void {
    return this.#seats.on(listener);
  }

  onCue(listener: (event: RadioCueEvent) => void): () => void {
    return this.#cues.on(listener);
  }

  onLiveChange(listener: (live: boolean) => void): () => void {
    return this.#layer.onLiveChange(listener);
  }

  onLayoutChange(listener: (layout: RadioLayout) => void): () => void {
    return this.#layouts.on(listener);
  }

  onDiscsOutChange(listener: (out: boolean) => void): () => void {
    return this.#shelf.on(listener);
  }

  prefetch(reason: 'idle' | 'intent'): void {
    // Save-Data: only a visitor reaching for the radio pays for it.
    if (!this.#isAvailable || (reason === 'idle' && saveData())) return;
    this.#wanted = true;
    this.#load();
  }

  setDiscs(discs: readonly DiscArt[]): void {
    if (discs.length < MIN_DISCS || discs.length > MAX_DISCS) {
      throw new RangeError(`The radio holds ${MIN_DISCS}–${MAX_DISCS} discs, not ${discs.length}`);
    }
    const recount = discs.length !== this.#discs.length;
    this.#discs = [...discs];
    if (recount) this.#frame();
    this.#device?.setDiscs(this.#discs);
  }

  setState(state: DeckState): void {
    const disc = state.loaded;
    const inserted = disc !== null && disc !== this.#state.loaded;
    if (state.loaded !== this.#state.loaded) this.#seatedFor = null;
    this.#state = state;
    if (this.#device) this.#device.setState(state);
    // Nothing to animate the insert with: the disc is on the spindle as soon as it is asked for.
    else if (disc !== null && inserted) queueMicrotask(() => this.#state.loaded === disc && this.#seat(disc));
  }

  press(key: RadioKey): void {
    this.#device?.press(key);
  }

  setAttention(disc: string | null): void {
    this.#keyboard = disc;
    this.#device?.setKeyboardAttention(disc);
    this.#updateAttention();
  }

  setControlInsets(insets: FramingInsets): void {
    const { top, right, bottom, left } = insets;
    const was = this.#insets;
    if (top === was.top && right === was.right && bottom === was.bottom && left === was.left) return;
    this.#insets = { top, right, bottom, left };
    this.#frame();
    this.#device?.relayout();
  }

  /** The room has loaded. Nothing is solved here: this runs before the room's first frame. */
  attach(host: RadioHost): void {
    this.#host = host;
    this.#frame();
    if (this.#wanted) this.#load();
  }

  /** The viewport changed: the rig re-posed already; the device re-lays the discs and the layout. */
  resize(): void {
    this.#device?.relayout();
  }

  /** The view state's `approachRadio`: the camera has set off for the radio. */
  approach(now: number): void {
    this.prefetch('intent');
    if (this.#device) this.#device.approach(now);
    else this.#pendingApproach = now;
  }

  /** The camera is about to set off for the radio: resolves once its discs are ready to be drawn (RadioDevice.board). */
  board(): Promise<void> {
    return this.#device?.board() ?? Promise.resolve();
  }

  /** The view state's `revealRadio`: landed. */
  reveal(): void {
    this.#layer.reveal();
    this.#device?.reveal();
  }

  /** The view state's `concealRadio`: hidden now, before the camera moves; the device closes up. */
  conceal(): void {
    this.#pendingApproach = null;
    this.#layer.conceal();
    this.#setDiscsOut(false);
    this.#device?.conceal();
  }

  dispose(): void {
    this.#device?.dispose();
    this.#device = null;
    this.#host?.rig.setRadioFraming(null);
    this.#host = null;
    this.#layer.dispose();
    for (const emitter of [
      this.#availability,
      this.#attentions,
      this.#intents,
      this.#seats,
      this.#cues,
      this.#layouts,
      this.#shelf,
    ]) {
      emitter.clear();
    }
  }

  #load(): void {
    const host = this.#host;
    if (!host || this.#loading || this.#device || !this.#isAvailable) return;
    this.#loading = true;
    this.#loadDeviceChunk(host, {
      reducedMotion: this.#reducedMotion,
      discCount: () => this.#discs.length,
      events: {
        intent: (intent) => this.#intents.emit(intent),
        seated: (disc) => this.#seat(disc),
        cue: (event) => this.#cues.emit(event),
        pointerAttention: (disc) => {
          this.#pointer = disc;
          this.#updateAttention();
        },
        layout: (layout) => {
          this.#current = layout;
          this.#layouts.emit(layout);
        },
        discsOut: (out) => this.#setDiscsOut(out && this.#layer.live),
      },
    }).then(
      (device) => {
        this.#loading = false;
        if (this.#host !== host) return device.dispose();
        this.#device = device;
        device.setDiscs(this.#discs);
        device.setState(this.#state);
        device.setKeyboardAttention(this.#keyboard);
        if (this.#pendingApproach !== null || host.views.view === 'radio') {
          device.approach(this.#pendingApproach ?? performance.now());
        }
        this.#pendingApproach = null;
        if (this.#layer.live) device.reveal();
      },
      (error: unknown) => {
        this.#loading = false;
        this.unavailable(error);
      },
    );
  }

  /** The radio cannot work (its code failed, or the room could not be lit): it is scenery again, warned once. */
  unavailable(error: unknown): void {
    if (!this.#isAvailable) return;
    console.warn(UNAVAILABLE_WARNING, error);
    this.#isAvailable = false;
    this.#pointer = null;
    this.#updateAttention();
    this.#availability.emit(false);
    // Flying to (or at) a radio that cannot open: back to the room.
    if (this.#host?.views.view === 'radio') this.#host.views.request('room');
  }

  /** The camera frames every disc slot clear of the app's controls: re-solved when either changes. */
  #frame(): void {
    const host = this.#host;
    host?.rig.setRadioFraming(radioPoseSolver(host.model, this.#discs.length, this.#insets));
  }

  /** Once per insert: a device that wakes up after the disc was seated without it seats it again, silently. */
  #seat(disc: string): void {
    if (disc === this.#seatedFor) return;
    this.#seatedFor = disc;
    this.#seats.emit(disc);
  }

  #setDiscsOut(out: boolean): void {
    if (out === this.#discsOut) return;
    this.#discsOut = out;
    this.#shelf.emit(out);
  }

  #updateAttention(): void {
    const next = this.#pointer ?? this.#keyboard;
    if (next === this.#attention) return;
    this.#attention = next;
    this.#attentions.emit(next);
  }
}
