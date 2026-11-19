import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import { PC_SPEC } from '../gen/roomSpec';

/** `userData.interaction_id` of the monitor's glass. */
export const PC_SCREEN_INTERACTION_ID = 'pc-screen';

/**
 * The monitor's glass: a display mesh, not a baked one. It faces +z; its UVs are a planar projection with v = 0 at the
 * top; its rim lies on the plane `rimZ` and its middle is `bulge` nearer the viewer. `Monitor` clones its material and
 * swaps the map for the still.
 */
export function createPcGlass(): Mesh<BufferGeometry, MeshBasicMaterial> {
  const { minX, maxX, minY, maxY, rimZ, bulge, columns, rows } = PC_SPEC.glass;
  const count = (columns + 1) * (rows + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const [width, height] = [maxX - minX, maxY - minY];
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const [u, v] = [column / columns, row / rows];
      const [s, t] = [2 * u - 1, 2 * v - 1];
      const i = row * (columns + 1) + column;
      // Flat along its whole rim, domed inside it.
      positions.set([minX + width * u, maxY - height * v, rimZ + bulge * (1 - s * s) * (1 - t * t)], i * 3);
      const dzdx = (bulge * -4 * s * (1 - t * t)) / width;
      const dzdy = (bulge * 4 * t * (1 - s * s)) / height;
      const length = Math.hypot(1, dzdx, dzdy);
      normals.set([-dzdx / length, -dzdy / length, 1 / length], i * 3);
      uvs.set([u, v], i * 2);
    }
  const index = new Uint16Array(columns * rows * 6);
  for (let row = 0, at = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      // Counter-clockwise seen from +z (the viewer).
      index.set([a, b, a + 1, a + 1, b, b + 1], at);
      at += 6;
    }
  const geometry = new BufferGeometry()
    .setAttribute('position', new BufferAttribute(positions, 3))
    .setAttribute('normal', new BufferAttribute(normals, 3))
    .setAttribute('uv', new BufferAttribute(uvs, 2))
    .setIndex(new BufferAttribute(index, 1));
  // White: Monitor draws a clone of it with the still for a map.
  const material = new MeshBasicMaterial();
  material.name = 'MAT_Screen';
  const glass = new Mesh(geometry, material);
  glass.name = 'PC_Interactive_Screen';
  glass.userData.interaction_id = PC_SCREEN_INTERACTION_ID;
  glass.userData.replaceable_screen = true;
  return glass;
}
