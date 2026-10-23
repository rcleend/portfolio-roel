import { Vector3 } from 'three';

/**
 * The flat rectangle a display's picture is registered to: the plane its glass rim sits on, in
 * world metres. The display faces +Z (towards the viewer), so the rectangle is axis-aligned and a
 * camera looking straight at it sees it as an axis-aligned rectangle on the page.
 *
 * Everything that maps between the glass, its texture and the page (projector UVs, the DOM
 * placement, the glass layer) works on this description, so another display can reuse them.
 */
export interface GlassPlane {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  /** World z of the rim; a curved glass bulges towards the viewer from here. */
  readonly z: number;
}

export function planeWidth(plane: GlassPlane): number {
  return plane.maxX - plane.minX;
}

export function planeHeight(plane: GlassPlane): number {
  return plane.maxY - plane.minY;
}

/** The same plane shrunk by `inset` metres on every side (e.g. a picture inside its tube border). */
export function insetPlane(plane: GlassPlane, inset: number): GlassPlane {
  return {
    minX: plane.minX + inset,
    maxX: plane.maxX - inset,
    minY: plane.minY + inset,
    maxY: plane.maxY - inset,
    z: plane.z,
  };
}

/** Corners in reading order: top-left, top-right, bottom-left, bottom-right. */
export function planeCorners(plane: GlassPlane): [Vector3, Vector3, Vector3, Vector3] {
  return [
    new Vector3(plane.minX, plane.maxY, plane.z),
    new Vector3(plane.maxX, plane.maxY, plane.z),
    new Vector3(plane.minX, plane.minY, plane.z),
    new Vector3(plane.maxX, plane.minY, plane.z),
  ];
}

export function planeCentre(plane: GlassPlane): Vector3 {
  return new Vector3((plane.minX + plane.maxX) / 2, (plane.minY + plane.maxY) / 2, plane.z);
}
