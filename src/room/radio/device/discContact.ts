import type { Quaternion, Vector3 } from 'three';
import { DISC_RADIUS, DISC_THICKNESS } from '../discLayout';

/**
 * Whether two compact discs touch: the choreography's promise that no disc ever passes through another (and its
 * tests' measure of it). Exact for flat discs: two discs in parallel planes touch when their faces are closer than
 * a disc's thickness and they overlap; in crossing planes, when the chords the line of the two planes cuts through
 * each disc overlap. The hole counts as disc. Pure, allocation-free, a microsecond a pair.
 */

export interface DiscShape {
  readonly position: Vector3;
  readonly orientation: Quaternion;
  readonly scale: number;
}

type V3 = [number, number, number];

/** The disc's normal: its local +z (the label side) in the world. */
function normalOf(q: Quaternion, out: V3): V3 {
  // The third column of the rotation matrix.
  const { x, y, z, w } = q;
  out[0] = 2 * (x * z + w * y);
  out[1] = 2 * (y * z - w * x);
  out[2] = 1 - 2 * (x * x + y * y);
  return out;
}

const na: V3 = [0, 0, 0];
const nb: V3 = [0, 0, 0];

/**
 * True when discs `a` and `b` touch or come closer than `margin` (m): their radii grow by it and their faces stand
 * `margin` further out.
 */
export function discsTouch(a: DiscShape, b: DiscShape, margin = 0): boolean {
  const ra = DISC_RADIUS * a.scale + margin;
  const rb = DISC_RADIUS * b.scale + margin;
  const pa = a.position;
  const pb = b.position;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const dz = pb.z - pa.z;
  const half = DISC_THICKNESS / 2 + margin / 2;
  // Too far apart to touch whatever their turn.
  if (dx * dx + dy * dy + dz * dz > (ra + rb + 2 * half) ** 2) return false;
  normalOf(a.orientation, na);
  normalOf(b.orientation, nb);
  // u = na × nb: the direction of the line both planes share.
  const ux = na[1] * nb[2] - na[2] * nb[1];
  const uy = na[2] * nb[0] - na[0] * nb[2];
  const uz = na[0] * nb[1] - na[1] * nb[0];
  const uu = ux * ux + uy * uy + uz * uz;
  if (uu < 1e-8) {
    // Parallel: they touch when their faces are within a thickness and they overlap side by side.
    const along = dx * na[0] + dy * na[1] + dz * na[2];
    if (Math.abs(along) > 2 * half) return false;
    const sx = dx - along * na[0];
    const sy = dy - along * na[1];
    const sz = dz - along * na[2];
    return sx * sx + sy * sy + sz * sz < (ra + rb) ** 2;
  }
  // Each disc is a slab of its thickness: try each face of one against each face of the other.
  for (const sa of [-half, half]) {
    for (const sb of [-half, half]) {
      if (flatTouch(pa, na, ra, sa, pb, nb, rb, sb, ux, uy, uz, uu)) return true;
    }
  }
  return false;
}

/** Two flat discs (centres moved `sa`, `sb` along their normals) in crossing planes: do their chords overlap? */
function flatTouch(
  pa: Vector3,
  normalA: V3,
  ra: number,
  sa: number,
  pb: Vector3,
  normalB: V3,
  rb: number,
  sb: number,
  ux: number,
  uy: number,
  uz: number,
  uu: number,
): boolean {
  const ax = pa.x + normalA[0] * sa;
  const ay = pa.y + normalA[1] * sa;
  const az = pa.z + normalA[2] * sa;
  const bx = pb.x + normalB[0] * sb;
  const by = pb.y + normalB[1] * sb;
  const bz = pb.z + normalB[2] * sb;
  const da = normalA[0] * ax + normalA[1] * ay + normalA[2] * az;
  const db = normalB[0] * bx + normalB[1] * by + normalB[2] * bz;
  // A point on both planes: (da (nb × u) + db (u × na)) / |u|².
  const cx = (da * (normalB[1] * uz - normalB[2] * uy) + db * (uy * normalA[2] - uz * normalA[1])) / uu;
  const cy = (da * (normalB[2] * ux - normalB[0] * uz) + db * (uz * normalA[0] - ux * normalA[2])) / uu;
  const cz = (da * (normalB[0] * uy - normalB[1] * ux) + db * (ux * normalA[1] - uy * normalA[0])) / uu;
  const length = Math.sqrt(uu);
  const ex = ux / length;
  const ey = uy / length;
  const ez = uz / length;
  const chord = (x: number, y: number, z: number, r: number): [number, number] | null => {
    const t = (x - cx) * ex + (y - cy) * ey + (z - cz) * ez;
    const qx = cx + ex * t - x;
    const qy = cy + ey * t - y;
    const qz = cz + ez * t - z;
    const h2 = qx * qx + qy * qy + qz * qz;
    if (h2 >= r * r) return null;
    const w = Math.sqrt(r * r - h2);
    return [t - w, t + w];
  };
  const ca = chord(ax, ay, az, ra);
  if (!ca) return false;
  const cb = chord(bx, by, bz, rb);
  if (!cb) return false;
  return Math.max(ca[0], cb[0]) <= Math.min(ca[1], cb[1]);
}
