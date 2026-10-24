import type { Vector3 } from 'three';
import type { Viewpoint } from './cameraPath';
import { type PagePoint, type PageViewport, projectToPage } from './pageProjection';

/** Props the visitor can fly to from the room view. */
export type RoomTarget = 'tv' | 'pc' | 'radio';

export interface PropAnchor {
  readonly target: RoomTarget;
  /**
   * Projected centre of the prop's picture in the settled room view, CSS px in the room container;
   * clamped into a 24 px band along the nearest edge when out of frame.
   */
  readonly x: number;
  readonly y: number;
  /** False when the centre is behind the camera or outside the viewport inset by 24 px. */
  readonly inFrame: boolean;
  /** The edge the clamped anchor sits on; null when in frame. */
  readonly edge: 'left' | 'right' | 'top' | 'bottom' | null;
}

/** A prop's world point to anchor app UI to (e.g. the middle of its picture). */
export interface AnchorTarget {
  readonly target: RoomTarget;
  readonly point: Vector3;
}

/** Anchors closer than this to an edge count as out of frame and are kept this far inside. */
export const EDGE_BAND = 24;

type Edge = NonNullable<PropAnchor['edge']>;
const EDGES: readonly Edge[] = ['left', 'right', 'top', 'bottom'];

/** How far a point behind the camera is pushed out along its direction: always past every edge. */
const BEHIND_REACH = 1e6;

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
    let { x, y, behind } = projected[i] as PagePoint;
    if (behind) {
      // Perspective division mirrors points behind the camera through the centre: undo that, so
      // a prop behind the viewer's left shoulder is marked on the left, and push it far out of
      // frame along that direction, since it can never be in shot.
      x = width / 2 - (x - width / 2) * BEHIND_REACH;
      y = height / 2 - (y - height / 2) * BEHIND_REACH;
    }
    const inFrame = !behind && x >= EDGE_BAND && x <= width - EDGE_BAND && y >= EDGE_BAND && y <= height - EDGE_BAND;
    if (inFrame) return { target, x, y, inFrame, edge: null };
    // How far past each edge's band it lies; the largest names the edge it is clamped to.
    const overflow = [EDGE_BAND - x, x - (width - EDGE_BAND), EDGE_BAND - y, y - (height - EDGE_BAND)];
    const edge = EDGES[overflow.indexOf(Math.max(...overflow))] as Edge;
    return {
      target,
      x: clamp(x, EDGE_BAND, width - EDGE_BAND),
      y: clamp(y, EDGE_BAND, height - EDGE_BAND),
      inFrame,
      edge,
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
