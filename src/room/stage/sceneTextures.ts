import { type Material, Mesh, type Object3D, type Texture } from 'three';
import type { IdleTask } from './IdleWork';

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
 * Uploads every texture of the meshes under `root`, one per unit of background work. three
 * uploads a texture the first time a frame draws it, and the TV view draws only part of the
 * attic: without this, the first look around the room would upload four 2048² atlases in the
 * middle of its flight (≈ 25 ms each), and on a phone the first flight to the computer two more.
 * A texture already on the GPU costs a bind.
 */
export function* uploadTextures(root: Object3D, renderer: TextureUploader): IdleTask {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (object instanceof Mesh) forEachTexture(object.material, (texture) => textures.add(texture));
  });
  for (const texture of textures) {
    yield;
    renderer.initTexture(texture);
  }
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as { isTexture?: unknown }).isTexture === true;
}
