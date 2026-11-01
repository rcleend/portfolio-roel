import type { Album } from '@/content/radio/types';
import type { DiscArt, RadioDeck } from '../deck';
import { type LabelArt, paintDiscLabel } from './discLabel';

/** What painting the shelf's prints needs from the page; the browser's in the player, fakes in tests. */
export interface DiscPrintsHost {
  /** The art at `url`, decoded off the main thread at `size` px square. */
  loadArt(url: string, size: number): Promise<ImageBitmap>;
  /** A blank square canvas `size` px across, or null when the page cannot draw (the disc stays plain). */
  canvas(size: number): { readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D } | null;
  /** Runs `task` once the main thread is idle; returns a cancel function. */
  whenIdle(task: () => void): () => void;
}

interface Pending {
  readonly album: Album;
  /** Undefined while the art is on its way; null when it failed (a plain disc with its text). */
  image: ImageBitmap | null | undefined;
}

/**
 * The shelf's prints for the room (SPEC §9.3). The room gets the shelf at once as plain discs, so it can lay out
 * the slots; the art then downloads and decodes off the main thread; and the prints are painted one per idle
 * moment, only while painting is allowed (the camera at rest away from the game), because a canvas paint costs a
 * few milliseconds of main thread, five in a row are a dropped frame on a slow phone, and a flight or the game
 * must never pay for them. Once every print is painted the room gets them together, in one `setDiscs`.
 */
export class DiscPrints {
  readonly #deck: Pick<RadioDeck, 'labelSize' | 'setDiscs'>;
  readonly #host: DiscPrintsHost;
  readonly #fileUrl: (album: Album, name: string) => string;
  /** The shelf's ids in display order. */
  readonly #ids: readonly string[];
  readonly #pending: Pending[];
  readonly #painted = new Map<string, HTMLCanvasElement | null>();
  /** Stops listening for a print's canvas coming back blank from a GPU reset, by album. */
  readonly #stopRestore = new Map<string, () => void>();
  #allowed = false;
  #cancelIdle: (() => void) | null = null;
  #disposed = false;

  constructor(
    deck: Pick<RadioDeck, 'labelSize' | 'setDiscs'>,
    albums: readonly Album[],
    fileUrl: (album: Album, name: string) => string,
    host: DiscPrintsHost,
  ) {
    this.#deck = deck;
    this.#host = host;
    this.#fileUrl = fileUrl;
    this.#ids = albums.map((album) => album.id);
    this.#pending = albums.map((album) => ({ album, image: undefined }));
  }

  /** Hands the room the plain shelf and starts fetching the art. */
  start(): void {
    const size = this.#deck.labelSize;
    this.#deck.setDiscs(this.#ids.map((id) => ({ id, label: null })));
    for (const pending of this.#pending) this.#load(pending, size);
  }

  /** Whether a print may be painted now; while false, painting waits. */
  setAllowed(allowed: boolean): void {
    this.#allowed = allowed;
    if (allowed) this.#schedule();
    else this.#unschedule();
  }

  dispose(): void {
    this.#disposed = true;
    this.#unschedule();
    for (const pending of this.#pending) pending.image?.close();
    for (const stop of this.#stopRestore.values()) stop();
    this.#stopRestore.clear();
  }

  #load(pending: Pending, size: number): void {
    const { album } = pending;
    this.#host.loadArt(this.#fileUrl(album, album.disc ?? album.cover), size).then(
      (image) => this.#arrived(pending, image),
      (error: unknown) => {
        console.warn(`The disc print of "${album.title}" could not load; it gets a plain one`, error);
        this.#arrived(pending, null);
      },
    );
  }

  /**
   * A GPU reset gives a print's canvas back blank, and the room's restored context uploads it as it is: a bare disc.
   * The decoded art is closed once painted (a few MB for the shelf), so it is fetched (from the HTTP cache) and decoded
   * again, and painted on a new canvas the room takes like any new print.
   */
  #restored(album: Album): void {
    this.#stopRestore.get(album.id)?.();
    this.#stopRestore.delete(album.id);
    if (this.#disposed) return;
    const pending: Pending = { album, image: undefined };
    this.#pending.push(pending);
    this.#load(pending, this.#deck.labelSize);
  }

  #arrived(pending: Pending, image: ImageBitmap | null): void {
    if (this.#disposed) {
      image?.close();
      return;
    }
    pending.image = image;
    this.#schedule();
  }

  #schedule(): void {
    if (this.#disposed || !this.#allowed || this.#cancelIdle) return;
    if (!this.#pending.some((pending) => pending.image !== undefined)) return;
    this.#cancelIdle = this.#host.whenIdle(() => {
      this.#cancelIdle = null;
      this.#paintOne();
      this.#schedule();
    });
  }

  #unschedule(): void {
    this.#cancelIdle?.();
    this.#cancelIdle = null;
  }

  #paintOne(): void {
    if (this.#disposed || !this.#allowed) return;
    const index = this.#pending.findIndex((pending) => pending.image !== undefined);
    const pending = this.#pending[index];
    if (!pending) return;
    this.#pending.splice(index, 1);
    const { album, image } = pending;
    const size = this.#deck.labelSize;
    const target = this.#host.canvas(size);
    if (target) {
      const art: LabelArt = image ? { kind: album.disc ? 'print' : 'cover', image } : null;
      paintDiscLabel(target.context, size, art, album);
    }
    image?.close();
    this.#painted.set(album.id, target?.canvas ?? null);
    if (target) {
      const restored = (): void => this.#restored(album);
      target.canvas.addEventListener('contextrestored', restored);
      this.#stopRestore.set(album.id, () => target.canvas.removeEventListener('contextrestored', restored));
    }
    if (this.#pending.length === 0) this.#deliver();
  }

  /** Every print is painted: the room gets them together, in the shelf's order. */
  #deliver(): void {
    this.#deck.setDiscs(this.#ids.map((id): DiscArt => ({ id, label: this.#painted.get(id) ?? null })));
  }
}
