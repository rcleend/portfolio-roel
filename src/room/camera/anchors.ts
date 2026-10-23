import type { Vector3 } from 'three';
import type { Viewpoint } from './cameraPath';
import { type PageViewport, projectToPage } from './pageProjection';

/** Props the visitor can fly to from the room view. */
export type RoomTarget = 'tv' | 'pc';

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

/**
 * Where the props sit on the page in the settled room view. Always projected from the room
 * pose itself, never the live camera, so pointer parallax and flights do not move app UI.
 */
export function propAnchors(targets: readonly AnchorTarget[], room: Viewpoint, viewport: PageViewport): PropAnchor[] {
  const projected = projectToPage(
    targets.map(({ point }) => point),
    room,
    viewport,
  );
  return targets.map(({ target }, i) => {
    const point = projected[i];
    if (!point) throw new Error('projectToPage dropped a point');
    const { width, height } = viewport;
    // Perspective division mirrors points behind the camera through the centre; undo that so
    // a prop behind the viewer's left shoulder is still marked on the left.
    let x = point.behind ? width - point.x : point.x;
    let y = point.behind ? height - point.y : point.y;
    const inFrame =
      !point.behind && x >= EDGE_BAND && x <= width - EDGE_BAND && y >= EDGE_BAND && y <= height - EDGE_BAND;
    if (inFrame) return { target, x, y, inFrame, edge: null };
    if (point.behind) [x, y] = pushOutOfFrame(x, y, viewport);
    const overflow: Record<Edge, number> = {
      left: EDGE_BAND - x,
      right: x - (width - EDGE_BAND),
      top: EDGE_BAND - y,
      bottom: y - (height - EDGE_BAND),
    };
    const edge = (Object.keys(overflow) as Edge[]).reduce((a, b) => (overflow[b] > overflow[a] ? b : a));
    return {
      target,
      x: clamp(x, EDGE_BAND, width - EDGE_BAND),
      y: clamp(y, EDGE_BAND, height - EDGE_BAND),
      inFrame: false,
      edge,
    };
  });
}

/** A point behind the camera is never in frame: move it out along its direction from the centre. */
function pushOutOfFrame(x: number, y: number, viewport: PageViewport): [number, number] {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const reach = Math.max(Math.abs(dx) / (cx - EDGE_BAND), Math.abs(dy) / (cy - EDGE_BAND));
  if (reach >= 1) return [x, y];
  // Straight behind the viewer has no side; any edge is as good as another.
  if (reach === 0) return [-1, cy];
  return [cx + (dx / reach) * 1.001, cy + (dy / reach) * 1.001];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
