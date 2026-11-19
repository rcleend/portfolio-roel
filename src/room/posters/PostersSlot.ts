import type { IdleTask } from '../stage/IdleWork';
import type { RoomView } from '../viewState';
import type { PosterWall, PosterWallContext } from './PosterWall';
import { posterKit } from './posterKit';

/**
 * Where the posters are, for stats and tests: none this page load, being painted (again, after a context loss),
 * painted with only the upload left (which goes between the game's frames at the TV on a hardware GPU, and waits for
 * the first departure on a software one), or up: drawn, or hidden at rest where no piece is in frame.
 */
export type PostersState = 'off' | 'loading' | 'staged' | 'ready';
/** How the walls draw once made: cards and skirts with a fade for a late arrival, or the cards alone (PosterWall.lite). */
export type PostersPath = 'full' | 'lite';

/** Imports the posters' lazy chunk; a seam for tests. */
export type PosterWallLoader = () => Promise<typeof import('./PosterWall')>;

const loadWall: PosterWallLoader = () => import('./PosterWall');

/**
 * Departed before the TV's unit ran (a playing game on a slow CPU may leave it no idle period there), that one unit
 * may follow a flight frame (IdleTaskOptions.sliceMs): it only starts the chunk's import, well under this long.
 */
const PREPARE_SLICE_MS = 2;
/**
 * The TV's unit only starts the lazy chunk's import (well under a millisecond, even at 6x CPU): it goes in any idle
 * period of the playing game, not only in one as long as the room's heaviest background unit.
 */
const PREPARE_ESTIMATE_MS = 1;

/**
 * The room's first-load half of the decorated walls (docs/ROOM.md › Posters): one idle unit at the TV imports the
 * lazy chunk, which decides the tier, paints the atlas and (on a hardware GPU) uploads it there; the first departure
 * from the TV makes whatever is left of that urgent. Everything else is PosterWall, in its own chunk, which reaches
 * the room's code only through the posterKit.
 */
export class PostersSlot {
  #state: PostersState;
  #wall: PosterWall | null = null;
  #departed = false;
  #disposed = false;
  #context: PosterWallContext | null = null;
  /** Drops the TV's unit while it is queued. */
  #dropPrepare: (() => void) | null = null;
  #settle: (shown: boolean) => void = () => {};
  /** Resolves true once the texture is complete, the program compiled and the node shown; false when it never will. */
  readonly ready: Promise<boolean>;
  readonly #load: PosterWallLoader;

  constructor(enabled: boolean, load: PosterWallLoader = loadWall) {
    this.#state = enabled ? 'loading' : 'off';
    this.#load = load;
    this.ready = new Promise((resolve) => (this.#settle = resolve));
    if (!enabled) this.#settle(false);
  }

  get state(): PostersState {
    return this.#state;
  }

  /** Texels of the posters' atlas on the GPU. */
  get texturePixels(): number {
    return this.#wall?.texturePixels ?? 0;
  }

  /** The path the loaded walls take; null until their code has loaded, and when they are off. */
  get path(): PostersPath | null {
    if (!this.#wall) return null;
    return this.#wall.lite ? 'lite' : 'full';
  }

  get fading(): boolean {
    return this.#wall?.fading ?? false;
  }

  /** Queues the TV's idle unit; it runs once the room's background work starts, after the first frame. */
  attach(context: PosterWallContext): void {
    if (this.#state !== 'loading' || this.#context) return;
    this.#context = context;
    this.#queuePrepare(context, this.#departed);
  }

  /** The camera is about to leave the TV (first time only matters): what is left is wanted now. */
  depart(): void {
    if (!this.#departed && this.#context && this.#dropPrepare) this.#queuePrepare(this.#context, true);
    this.#departed = true;
    this.#wall?.depart();
  }

  /**
   * The camera is about to fly: resolves once the walls are up, if they are painted and only their upload and program
   * were left (which the room has just run: IdleWork.drain), or after `maxMs`; at once while they are still being
   * painted, since those arrive after the landing instead.
   */
  boarded(maxMs: number): Promise<void> {
    return this.#wall?.boarded(maxMs) ?? Promise.resolve();
  }

  /** A reduced-motion cut to `to` waits while the posters are painted and uploaded (see PosterWall.holdsCut). */
  holdsCut(to: RoomView): boolean {
    return this.#wall?.holdsCut(to) ?? false;
  }

  dispose(): void {
    this.#disposed = true;
    this.#dropPrepare?.();
    this.#wall?.dispose();
    this.#wall = null;
    this.#end(false);
  }

  /** Queues the TV's unit: ordinary background work at the TV, urgent and sliced once the visitor has departed. */
  #queuePrepare(context: PosterWallContext, departed: boolean): void {
    this.#dropPrepare?.();
    this.#dropPrepare = context.background.add(
      this.#prepare(context),
      departed ? { urgent: () => true, sliceMs: PREPARE_SLICE_MS } : { estimateMs: PREPARE_ESTIMATE_MS },
    );
  }

  *#prepare(context: PosterWallContext): IdleTask {
    this.#dropPrepare = null;
    this.#load().then(
      ({ PosterWall }) => {
        if (this.#disposed) return;
        this.#wall = new PosterWall(context, posterKit, {
          onStaged: () => {
            if (this.#state === 'loading') this.#state = 'staged';
          },
          onShown: () => {
            this.#state = 'ready';
            this.#end(true);
          },
          onLost: () => {
            if (this.#state !== 'off') this.#state = 'loading';
          },
          onFailed: () => this.#end(false),
        });
        if (this.#departed) this.#wall.depart();
      },
      (error: unknown) => {
        console.warn('The posters could not be made; the walls stay bare.', error);
        this.#end(false);
      },
    );
  }

  #end(shown: boolean): void {
    if (!shown) this.#state = 'off';
    this.#settle(shown);
  }
}
