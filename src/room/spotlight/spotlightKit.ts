import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';

/**
 * The three.js the lazy spotlight draws with, all of it already in the room's chunk, handed over rather than imported:
 * a runtime import from the lazy chunk would split three.js into a common chunk on the critical path (posterKit.ts
 * says why). Spotlight.ts imports types only; scripts/bundle-report.mjs's propSpotlight row (three: 'room') holds it to that.
 */
export const spotlightKit = {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} as const;

export type SpotlightKit = typeof spotlightKit;
