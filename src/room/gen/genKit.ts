import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CustomBlending,
  DepthTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OneFactor,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  UnsignedIntType,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
} from 'three';
import { onCanvasRestored } from '../stage/canvasRestore';
import { QUIET } from '../stage/IdleWork';

/**
 * The three.js the lazy generated room builds and bakes with, all of it already in the room's chunk, handed over
 * rather than imported (posterKit.ts says why). Everything under gen/ but this file and GeneratedSlot.ts imports types
 * only; scripts/bundle-report.mjs's generatedRoom row (three: 'room') holds it to that.
 */
export const genKit = {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CustomBlending,
  DepthTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OneFactor,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  UnsignedIntType,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
  /** IdleWork's QUIET: the unit it leads to is GPU work. */
  quiet: QUIET,
  onCanvasRestored,
} as const;

export type GenKit = typeof genKit;
