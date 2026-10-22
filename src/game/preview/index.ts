/**
 * Scenes shown in isolation, for the playground (docs/ARCHITECTURE.md ›
 * Development harness): the real scenes on real services, minus navigation,
 * input and, unless asked for, sound.
 */
export { createPreviewServices, type PreviewServices, type PreviewServicesOptions } from './createPreviewServices';
export type { PreviewSpec, SceneRequest } from './PreviewDirector';
export { ScenePreview, type ScenePreviewOptions } from './ScenePreview';
