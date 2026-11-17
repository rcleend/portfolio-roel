import type { BufferGeometry, Scene } from 'three';
import type { Shown } from './kit/builder';

/** A mesh with parts in two makings: its geometry, and the run of its indices each making draws. */
export interface TwiceMade {
  readonly geometry: BufferGeometry;
  readonly shown: Shown;
}

/**
 * Shows each mesh's built making in a frame drawn with multisampling and its drawn one in a frame drawn without
 * (docs/ROOM.md › Lines without multisampling), by what that frame's own target says: the quality tier may change
 * between any two frames, and the frame after the change is already right. The two makings are runs of one mesh's
 * indices, so the choice is a draw range: no draw call is added and nothing is built or baked again. Anything that
 * is not a view of the room (the bake's shadow maps, whose cameras see the casters' layers only) gets the built
 * making, which is what casts the room's shadows whichever is shown. Returns what undoes it.
 */
export function showMakings(scene: Scene, meshes: readonly TwiceMade[]): () => void {
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (renderer, _scene, camera, target) => {
    const view = (camera.layers.mask & 1) !== 0;
    // three.js types the target loosely here: a render target, or null for the canvas.
    const samples = (target as { samples?: number } | null)?.samples;
    // A lost context has no attributes: whatever is drawn then is not seen.
    const sampled = samples === undefined ? (renderer.getContextAttributes()?.antialias ?? false) : samples > 0;
    for (const { geometry, shown } of meshes) geometry.setDrawRange(...(view && !sampled ? shown.drawn : shown.built));
  };
  for (const { geometry, shown } of meshes) geometry.setDrawRange(...shown.built);
  return () => {
    scene.onBeforeRender = before;
  };
}
