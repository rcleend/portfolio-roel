import { BufferAttribute, BufferGeometry } from 'three';
import { DISC_HOLE_RADIUS, DISC_RADIUS, DISC_THICKNESS } from '../discLayout';

/** Segments around the disc: smooth at the largest size a disc reaches on screen (~350 px across). */
export const DISC_SEGMENTS = 64;

/**
 * A compact disc built by hand (no CylinderGeometry: the radio's lazy chunk uses only classes the room chunk
 * already has): the label face (+z), the data face (−z), the 1.2 mm outer edge and the hole's wall, 512 triangles.
 * `uv` is the disc-local position normalised to the 120 mm square, the same on both faces, so a print painted on
 * a square canvas lands where it was painted; `face` is +1 on the label side, −1 on the data side, 0 on the edges.
 */
export function discGeometry(segments = DISC_SEGMENTS): BufferGeometry {
  const half = DISC_THICKNESS / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const faces: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, face: number): number => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(x / (2 * DISC_RADIUS) + 0.5, y / (2 * DISC_RADIUS) + 0.5);
    faces.push(face);
    return positions.length / 3 - 1;
  };
  const ring = (radius: number, z: number, normal: (c: number, s: number) => [number, number, number], face: number) =>
    Array.from({ length: segments }, (_, k) => {
      const angle = (2 * Math.PI * k) / segments;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return vertex(radius * c, radius * s, z, ...normal(c, s), face);
    });
  const strip = (inner: number[], outer: number[], flip: boolean) => {
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments;
      const [a, b, c, d] = [inner[k], outer[k], outer[k1], inner[k1]] as [number, number, number, number];
      if (flip) indices.push(a, c, b, a, d, c);
      else indices.push(a, b, c, a, c, d);
    }
  };
  // Label face (+z) and data face (−z): counter-clockwise seen from outside.
  strip(
    ring(DISC_HOLE_RADIUS, half, () => [0, 0, 1], 1),
    ring(DISC_RADIUS, half, () => [0, 0, 1], 1),
    false,
  );
  strip(
    ring(DISC_HOLE_RADIUS, -half, () => [0, 0, -1], -1),
    ring(DISC_RADIUS, -half, () => [0, 0, -1], -1),
    true,
  );
  // The outer edge faces out, the hole's wall faces the axis.
  strip(
    ring(DISC_RADIUS, -half, (c, s) => [c, s, 0], 0),
    ring(DISC_RADIUS, half, (c, s) => [c, s, 0], 0),
    true,
  );
  strip(
    ring(DISC_HOLE_RADIUS, -half, (c, s) => [-c, -s, 0], 0),
    ring(DISC_HOLE_RADIUS, half, (c, s) => [-c, -s, 0], 0),
    false,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('face', new BufferAttribute(new Float32Array(faces), 1));
  geometry.setIndex(new BufferAttribute(new Uint16Array(indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
}
