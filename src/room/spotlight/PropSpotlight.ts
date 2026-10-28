import type { RoomTarget } from '../camera/anchors';

/** The prop in the light and where its label goes. */
export interface LitProp {
  readonly target: RoomTarget;
  /** The middle of the prop's top, CSS px in the room container, following the prop as it bounces. */
  readonly x: number;
  readonly y: number;
}

/**
 * The props' spotlight in the room view (docs/ROOM.md › The spotlight): the prop under the pointer, or the one the
 * app lights (its menu), glows, bounces and wants a label. The room draws the glow and the bounce; the app draws the
 * label where the room says. Only a camera resting in the room view lights anything.
 */
export interface PropSpotlight {
  /** Lights `target` for the app (its menu item has the pointer or the keyboard); null hands back to the pointer. */
  light(target: RoomTarget | null): void;
  /** The lit prop, or null. */
  readonly lit: LitProp | null;
  /** Called when the lit prop changes and on every frame its label point moves. */
  onChange(listener: (lit: LitProp | null) => void): () => void;
}
