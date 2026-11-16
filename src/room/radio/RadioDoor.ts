import type { RadioDevice, RadioHost } from './deviceContract';
import { saveData } from './deviceFacts';
import type { RadioDeck, RadioDoor } from './RadioDeck';
import type { RadioDeckHandle } from './RadioDeckHandle';
import type { RadioPartsTarget } from './RadioInteractable';

/** Imports the deck's chunk and makes the deck over `container`; a seam for tests. */
export type DeckLoader = (container: HTMLElement, reducedMotion: MediaQueryList) => Promise<RadioDeckHandle>;

const loadDeck: DeckLoader = (container, reducedMotion) =>
  import('./deckChunk').then((module) => module.createRadioDeck(container, reducedMotion));

/** Warned once, by whichever of the door and the deck finds out first. */
export const UNAVAILABLE_WARNING = 'The CD player could not load; the radio stays scenery.';

/**
 * The room's public face of the CD player (`room.radio`), and all of it in the room's first load: whether the radio
 * works, and the way in. Everything else (the deck the app drives, its controls slot, the camera's radio framing and
 * the device) is the radio's lazy chunk (deckChunk.ts), imported as the camera first leaves the TV, on a prefetch, or on a request for the
 * radio view, which waits for it (ViewController's `whenReady`). It forwards the view state's radio effects to the deck; those only
 * happen once the deck is there, because the radio view cannot be entered before.
 */
export class RadioDoorHandle implements RadioDoor {
  #deck: RadioDeckHandle | null = null;
  #loading: Promise<RadioDeckHandle> | null = null;
  #host: RadioHost | null = null;
  /** The radio cannot work and its deck never came (its chunk failed, or the room could not be lit). */
  #failed = false;
  #disposed = false;
  readonly #availability = new Set<(available: boolean) => void>();

  readonly #container: HTMLElement;
  readonly #reducedMotion: MediaQueryList;
  readonly #loadDeck: DeckLoader;

  constructor(container: HTMLElement, reducedMotion: MediaQueryList, loader: DeckLoader = loadDeck) {
    this.#container = container;
    this.#reducedMotion = reducedMotion;
    this.#loadDeck = loader;
  }

  get available(): boolean {
    return !this.#failed && (this.#deck?.available ?? true);
  }

  /** The deck once `load` has brought it (the room drives its flights and sizes through it), else null. */
  get deck(): RadioDeckHandle | null {
    return this.#deck;
  }

  /** The device once it is loaded, cut and prepared (for the frame loop, the pointer and stats); null before. */
  get prepared(): RadioDevice | null {
    return this.#deck?.prepared ?? null;
  }

  /** The radio view's half of the click target (RadioInteractable), once the deck is here. */
  get parts(): RadioPartsTarget | null {
    return this.#deck?.parts ?? null;
  }

  onAvailableChange(listener: (available: boolean) => void): () => void {
    this.#availability.add(listener);
    return () => this.#availability.delete(listener);
  }

  prefetch(reason: 'idle' | 'intent'): void {
    // Save-Data: only a visitor reaching for the radio pays for it.
    if (!this.available || (reason === 'idle' && saveData())) return;
    if (this.#deck) this.#deck.prefetch(reason);
    else this.load().then((deck) => deck.prefetch(reason), ignore);
  }

  load(): Promise<RadioDeck> {
    if (!this.available) return Promise.reject(new Error('The CD player cannot work'));
    this.#loading ??= this.#loadDeck(this.#container, this.#reducedMotion).then(
      (deck) => {
        if (this.#disposed || this.#failed) {
          deck.dispose();
          throw new Error('The CD player cannot work');
        }
        this.#deck = deck;
        deck.onAvailableChange((available) => this.#emit(available));
        if (this.#host) deck.attach(this.#host);
        return deck;
      },
      (error: unknown) => {
        this.unavailable(error);
        throw error;
      },
    );
    return this.#loading;
  }

  /** Imports the deck ahead of need (the camera has left the TV, so the radio is a click away); never on Save-Data. */
  preload(): void {
    if (this.available && !saveData()) this.load().catch(ignore);
  }

  /** The room has loaded. Nothing is solved here: this runs before the room's first frame. */
  attach(host: RadioHost): void {
    this.#host = host;
    this.#deck?.attach(host);
  }

  /** The radio cannot work (its code failed, or the room could not be lit): it is scenery again, warned once. */
  unavailable(error: unknown): void {
    if (this.#deck) {
      this.#deck.unavailable(error);
      return;
    }
    if (this.#failed) return;
    console.warn(UNAVAILABLE_WARNING, error);
    this.#failed = true;
    this.#emit(false);
  }

  dispose(): void {
    this.#disposed = true;
    this.#deck?.dispose();
    this.#deck = null;
    this.#host = null;
    this.#availability.clear();
  }

  #emit(available: boolean): void {
    for (const listener of this.#availability) listener(available);
  }
}

function ignore(): void {}
