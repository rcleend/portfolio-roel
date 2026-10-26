import { HemisphereLight, type Scene } from 'three';

/**
 * The room AND its devices share the revision-6 Cycles bake. Only the moving lava
 * and its transparent shell need live lighting. A small hemisphere is sufficient;
 * an unrelated studio environment would no longer improve any static surface.
 */
export function addRoomLighting(scene: Scene): () => void {
  const light = new HemisphereLight(0xb8c9ee, 0x514052, 0.65);
  scene.add(light);
  return () => scene.remove(light);
}
