import type { GeneratedContext, GeneratedRoom, GeneratedStats } from './GeneratedRoom';
import { genKit } from './genKit';

/** Where the generated room is: not asked for, on its way (again, after a context loss), on screen, or failed. */
export type GeneratedState = 'off' | 'loading' | 'ready' | 'failed';

/** Imports the generated room's lazy chunk; a seam for tests. */
export type GeneratedLoader = () => Promise<typeof import('./GeneratedRoom')>;

/**
 * The room's first-load half of the generated room (docs/ROOM.md › The generated room): nothing at all unless the room
 * was created with `generated`, and then one import, after the first frame. Everything else is GeneratedRoom, in its
 * own chunk, which reaches the room's code only through the genKit.
 */
export class GeneratedSlot {
  state: GeneratedState;
  #room: GeneratedRoom | null = null;
  #settle: (shown: boolean) => void = () => {};
  /** Resolves true once the generated pieces are on screen, false when they will not be this page load. */
  readonly ready: Promise<boolean> = new Promise((resolve) => (this.#settle = resolve));

  constructor(
    enabled: boolean,
    private readonly load: GeneratedLoader = () => import('./GeneratedRoom'),
  ) {
    this.state = enabled ? 'loading' : 'off';
    if (!enabled) this.#settle(false);
  }

  get stats(): GeneratedStats | null {
    return this.#room?.stats ?? null;
  }

  /** Whether the generated lava lamp's wax is moving. */
  get lavaRunning(): boolean {
    return this.#room?.lavaRunning ?? false;
  }

  /** Starts the generated room; called once the shipped room is assembled and its first frame drawn. */
  attach(context: GeneratedContext): void {
    if (this.state !== 'loading' || this.#room) return;
    const failed = (error: unknown): void => {
      console.warn('The generated room could not be built; the shipped room stays.', error);
      this.state = 'failed';
      this.#settle(false);
    };
    this.load().then(({ GeneratedRoom }) => {
      if (this.state !== 'loading') return;
      this.#room = new GeneratedRoom(context, genKit, {
        onShown: () => {
          this.state = 'ready';
          this.#settle(true);
        },
        onLost: () => {
          this.state = 'loading';
        },
        onFailed: failed,
      });
    }, failed);
  }

  dispose(): void {
    this.state = 'off';
    this.#room?.dispose();
    this.#room = null;
    this.#settle(false);
  }
}
