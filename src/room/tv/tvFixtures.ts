import { type Document, getBounds } from '@gltf-transform/core';
import { Box3, BufferAttribute, BufferGeometry, Matrix4, Mesh, Vector3 } from 'three';
import { fitContentRect, type UvRect } from './screenMapping';
import { pictureOutline, type TvFramingModel } from './tvFraming';
import { TV_PICTURE_INSET, TV_SCREEN_APERTURE, TV_SCREEN_INTERACTION_ID } from './tvModel';

/** The game's 320 × 240 picture. */
const GAME_ASPECT = 4 / 3;

export interface TvFixture {
  /** The glass as three loads it, in the room's space. */
  readonly glass: Mesh;
  /** The game's picture in the glass's UVs, as `CrtScreen` fits it. */
  readonly content: UvRect;
  readonly framing: TvFramingModel;
}

/**
 * For tests: the TV of the shipped tv-high.glb (room revision 6, read with glTF Transform), measured as `locateTv`
 * and `CrtScreen` measure it at runtime.
 */
export function tvFixture(document: Document): TvFixture {
  const node = document
    .getRoot()
    .listNodes()
    .find((candidate) => candidate.getExtras().interaction_id === TV_SCREEN_INTERACTION_ID);
  const primitive = node?.getMesh()?.listPrimitives()[0];
  const position = primitive?.getAttribute('POSITION');
  const uv = primitive?.getAttribute('TEXCOORD_0');
  const indices = primitive?.getIndices()?.getArray();
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!node || !position || !uv || !indices || !scene) throw new Error('The document has no TV glass');
  // getElement denormalizes the quantized attributes.
  const read = (accessor: typeof position): Float32Array => {
    const size = accessor.getElementSize();
    const values = new Float32Array(accessor.getCount() * size);
    const element: number[] = [];
    for (let i = 0; i < accessor.getCount(); i++) values.set(accessor.getElement(i, element), i * size);
    return values;
  };
  const geometry = new BufferGeometry()
    .setAttribute('position', new BufferAttribute(read(position), 3))
    .setAttribute('uv', new BufferAttribute(read(uv), 2))
    .setIndex(Array.from(indices));
  const glass = new Mesh(geometry);
  glass.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix()));
  glass.updateMatrixWorld(true);

  // The glass faces −x (into the room), so its width runs along z.
  const size = new Box3().setFromObject(glass).getSize(new Vector3());
  const content = fitContentRect(TV_SCREEN_APERTURE, size.z / size.y, GAME_ASPECT, TV_PICTURE_INSET);
  const { min, max } = getBounds(scene);
  const bounds = new Box3(new Vector3(...min), new Vector3(...max));
  const framing = { facing: new Vector3(-1, 0, 0), bounds, picture: pictureOutline(glass, content) };
  return { glass, content, framing };
}
