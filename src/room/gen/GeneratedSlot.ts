import type { GeneratedContext, GeneratedRoom, GeneratedStats } from './GeneratedRoom';
import { genKit } from './genKit';

/** Where the generated room is: not asked for, on its way (again, after a context loss), on screen, or failed. */
export type GeneratedState = 'off' | 'loading' | 'ready' | 'failed';

/** Imports the generated room's lazy chunk; a seam for tests. */
export type GeneratedLoader = () => Promise<typeof import('./GeneratedRoom')>;

const loadGenerated: GeneratedLoader = () => import('./GeneratedRoom');

/**
 * The room's first-load half of the generated room (docs/ROOM.md › The generated room): nothing at all unless the room
 * was created with `generated`, and then one import, after the first frame. Everything else is GeneratedRoom, in its
 * own chunk, which reaches the room's code only through the genKit.
 */
export class GeneratedSlot {
  #state: GeneratedState;
  #room: GeneratedRoom | null = null;
  #disposed = false;
  #settle: (shown: boolean) => void = () => {};
  /** Resolves true once the generated pieces are on screen, false when they will not be this page load. */
  readonly ready: Promise<boolean>;
  readonly #load: GeneratedLoader;

  constructor(enabled: boolean, load: GeneratedLoader = loadGenerated) {
    this.#state = enabled ? 'loading' : 'off';
    this.#load = load;
    this.ready = new Promise((resolve) => (this.#settle = resolve));
    if (!enabled) this.#settle(false);
  }

  get state(): GeneratedState {
    return this.#state;
  }

  get stats(): GeneratedStats | null {
    return this.#room?.stats ?? null;
  }

  /** Starts the generated room; called once the shipped room is assembled and its first frame drawn. */
  attach(context: GeneratedContext): void {
    if (this.#state !== 'loading' || this.#room) return;
    this.#load().then(
      ({ GeneratedRoom }) => {
        if (this.#disposed) return;
        this.#room = new GeneratedRoom(context, genKit, {
          onShown: () => {
            this.#state = 'ready';
            this.#settle(true);
          },
          onLost: () => {
            this.#state = 'loading';
          },
          onFailed: (error) => this.#fail(error),
        });
      },
      (error: unknown) => this.#fail(error),
    );
  }

  dispose(): void {
    this.#disposed = true;
    this.#room?.dispose();
    this.#room = null;
    this.#settle(false);
  }

  #fail(error: unknown): void {
    console.warn('The generated room could not be built; the shipped room stays.', error);
    this.#state = 'failed';
    this.#settle(false);
  }
}
