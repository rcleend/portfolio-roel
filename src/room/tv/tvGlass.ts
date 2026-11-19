import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import { TV_SPEC } from '../gen/roomSpec';

/** `userData.interaction_id` of the screen mesh. */
export const TV_SCREEN_INTERACTION_ID = 'tv-screen';

/**
 * The TV's glass (docs/ROOM.md › TV geometry contract): a display mesh, not a baked one. A grid over the tube whose
 * 0–1 UV square is a planar projection (u left to right for the viewer, v = 0 at the top), bulging towards the viewer
 * as a parabola each way. `CrtScreen` swaps its material for the tube's shader; `pictureOutline` and `screenLight`
 * measure its triangles.
 */
export function createTvGlass(): Mesh<BufferGeometry, MeshBasicMaterial> {
  const { left, right, top, bottom, front, bulge, columns, rows } = TV_SPEC.glass;
  const count = (columns + 1) * (rows + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const [width, height] = [right - left, top - bottom];
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const [u, v] = [column / columns, row / rows];
      const [s, t] = [2 * u - 1, 2 * v - 1];
      const i = row * (columns + 1) + column;
      positions.set([front + bulge[0] * s * s + bulge[1] * t * t, top - height * v, left + width * u], i * 3);
      // The gradient of x over (y, z): the glass faces −x, leaning with the bulge.
      const dxdz = (4 * bulge[0] * s) / width;
      const dxdy = (-4 * bulge[1] * t) / height;
      const length = Math.hypot(1, dxdy, dxdz);
      normals.set([-1 / length, dxdy / length, dxdz / length], i * 3);
      uvs.set([u, v], i * 2);
    }
  const index = new Uint16Array(columns * rows * 6);
  for (let row = 0, at = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      // Counter-clockwise seen from −x (the viewer).
      index.set([a, b, a + 1, a + 1, b, b + 1], at);
      at += 6;
    }
  const geometry = new BufferGeometry()
    .setAttribute('position', new BufferAttribute(positions, 3))
    .setAttribute('normal', new BufferAttribute(normals, 3))
    .setAttribute('uv', new BufferAttribute(uvs, 2))
    .setIndex(new BufferAttribute(index, 1));
  const material = new MeshBasicMaterial({ color: 0x000000 });
  material.name = 'TV replaceable phosphor screen';
  const glass = new Mesh(geometry, material);
  glass.name = 'TV_Interactive_Screen';
  glass.userData.interaction_id = TV_SCREEN_INTERACTION_ID;
  glass.userData.replaceable_screen = true;
  return glass;
}
