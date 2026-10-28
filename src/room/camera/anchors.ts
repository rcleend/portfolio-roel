import type { Vector3 } from 'three';
import type { Viewpoint } from './cameraPath';
import { type PagePoint, type PageViewport, projectToPage } from './pageProjection';

/** Props the visitor can fly to from the room view. */
export type RoomTarget = 'tv' | 'pc' | 'radio';

export interface PropAnchor {
  readonly target: RoomTarget;
  /** Projected centre of the prop's picture in the settled room view, CSS px in the room container. */
  readonly x: number;
  readonly y: number;
  /** False when the centre is behind the camera or outside the viewport inset by 24 px; `x` and `y` are then idle. */
  readonly inFrame: boolean;
}

/** A prop's world point to anchor app UI to (e.g. the middle of its picture). */
export interface AnchorTarget {
  readonly target: RoomTarget;
  readonly point: Vector3;
}

/** Anchors closer than this to an edge count as out of frame. */
export const EDGE_BAND = 24;

/**
 * Where the props sit on the page in the settled room view. Always projected from the room
 * pose itself, never the live camera, so pointer parallax and flights do not move app UI.
 */
export function propAnchors(targets: readonly AnchorTarget[], room: Viewpoint, viewport: PageViewport): PropAnchor[] {
  const { width, height } = viewport;
  const projected = projectToPage(
    targets.map(({ point }) => point),
    room,
    viewport,
  );
  return targets.map(({ target }, i) => {
    const { x, y, behind } = projected[i] as PagePoint;
    const inFrame = !behind && x >= EDGE_BAND && x <= width - EDGE_BAND && y >= EDGE_BAND && y <= height - EDGE_BAND;
    return { target, x, y, inFrame };
  });
}
