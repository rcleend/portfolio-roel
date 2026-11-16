import { type Material, Mesh, type Object3D, type Texture } from 'three';
import { type IdleTask, QUIET } from './IdleWork';

/** The one renderer call this needs: upload a texture now rather than on the next frame that uses it. */
export interface TextureUploader {
  initTexture(texture: Texture): void;
}

/** Visits every texture a material holds (its map, alpha map, …). */
export function forEachTexture(material: Material | Material[], visit: (texture: Texture) => void): void {
  for (const m of Array.isArray(material) ? material : [material]) {
    for (const value of Object.values(m)) {
      if (isTexture(value)) visit(value);
    }
  }
}

/**
 * Uploads every texture of the meshes under `root` that no frame has drawn yet, one per unit of
 * background work. three uploads a texture the first time a frame draws it: a view that never
 * showed a mesh leaves its texture for the first flight that does. On a phone, whose portrait
 * room view crops the computer out, the first flight to the computer would upload two 2048²
 * atlases on its way (27-36 ms each on a phone six times slower than a laptop). A texture already
 * on the GPU costs a bind.
 */
export function* uploadTextures(root: Object3D, renderer: TextureUploader): IdleTask {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    // A mesh the generated room has replaced (gen/GeneratedRoom.ts) is never drawn again: its atlas stays off the GPU.
    if (object instanceof Mesh && !object.userData.retired)
      forEachTexture(object.material, (texture) => textures.add(texture));
  });
  for (const texture of textures) {
    yield QUIET;
    renderer.initTexture(texture);
  }
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as { isTexture?: unknown }).isTexture === true;
}
