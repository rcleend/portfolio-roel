import type { RoomTarget } from '../camera/anchors';
import type { LitProp, PropSpotlight } from './PropSpotlight';
import type { Spotlight, SpotlightHost } from './spotlightContract';

/**
 * `room.spotlight` (room chunk; docs/ROOM.md › The spotlight): which prop to light — the app's, else the one under the
 * pointer — while the camera rests in the room view. The glow, the bounce and the label point are the lazy
 * `propSpotlight` chunk's, imported behind the first flight away from the TV; until then, or if it fails, nothing is
 * lit and the room works as before.
 */
export class SpotlightDoor implements PropSpotlight {
  #request: RoomTarget | null = null;
  #hovered: RoomTarget | null = null;
  /** The camera rests in the room view. */
  #open = false;
  #lit: LitProp | null = null;
  readonly #listeners = new Set<(lit: LitProp | null) => void>();
  #host: (() => SpotlightHost) | null = null;
  #chunk: Spotlight | null = null;
  #disposed = false;

  get lit(): LitProp | null {
    return this.#lit;
  }

  /** The chunk is in: its two programs exist (RoomStats.spotlight). */
  get loaded(): boolean {
    return this.#chunk !== null;
  }

  light(target: RoomTarget | null): void {
    this.#request = target;
    this.#update();
  }

  onChange(listener: (lit: LitProp | null) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The prop under the pointer (RoomInteraction's hover), or null. */
  hover(target: RoomTarget | null): void {
    this.#hovered = target;
    this.#update();
  }

  /** The camera came to rest in the room view (true), or set off anywhere (false). */
  setOpen(open: boolean): void {
    this.#open = open;
    this.#update();
  }

  /** The loaded room's half: what the chunk lights and draws with. */
  attach(host: () => SpotlightHost): void {
    this.#host = host;
  }

  /** Imports the chunk, once (the first departure from the TV, as the radio's deck). */
  preload(): void {
    const host = this.#host;
    if (!host || this.#disposed) return;
    this.#host = null;
    import('./Spotlight').then(
      ({ createSpotlight }) => {
        if (this.#disposed) return;
        this.#chunk = createSpotlight(host(), (lit) => {
          this.#lit = lit;
          for (const listener of this.#listeners) listener(lit);
        });
        this.#update();
      },
      (error: unknown) => console.warn('The props will not light up', error),
    );
  }

  dispose(): void {
    this.#disposed = true;
    this.#chunk?.dispose();
    this.#listeners.clear();
  }

  #update(): void {
    this.#chunk?.show(this.#open ? (this.#request ?? this.#hovered) : null);
  }
}
