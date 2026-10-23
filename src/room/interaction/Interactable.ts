import type { Object3D, Vector2, Vector3 } from 'three';

/** Where a pointer ray met an interactable. */
export interface InteractionHit {
  /** The mesh that was hit (a descendant of the interactable's object). */
  readonly object: Object3D;
  readonly point: Vector3;
  /** Texture coordinates at the hit, when the mesh has them. */
  readonly uv: Vector2 | null;
}

/**
 * Anything in the room the viewer can point at and click: the TV or the computer.
 * Register one with RoomInteraction and it gets hover
 * cursors, clicks and (optionally) a full pointer gesture, without touching the TV logic.
 */
export interface Interactable {
  readonly id: string;
  /** Ray-cast target; its descendants as they are when it is registered count as part of it. */
  readonly object: Object3D;
  /**
   * While this interactable owns a gesture, moves are ray-cast against this object instead
   * (e.g. the TV glass, so dragging across the bezel still lands on the nearest pixel).
   */
  readonly gestureSurface?: Object3D;
  /** CSS cursor while the pointer is over it. */
  cursor(hit: InteractionHit): string;
  /** A click or tap that was not consumed as a gesture. */
  activate(hit: InteractionHit): void;
  /**
   * Pointer pressed on it. Return true to own the rest of the gesture: moves and the release
   * then go to this interactable even off its surface, and no `activate` follows.
   */
  pointerDown?(hit: InteractionHit): boolean;
  /** Pointer moved over it, or (while it owns a gesture) anywhere; `null` when off-surface. */
  pointerMove?(hit: InteractionHit | null): void;
  pointerUp?(): void;
  pointerLeave?(): void;
}
