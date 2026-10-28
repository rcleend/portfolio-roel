import type { Camera, Object3D, Vector3, WebGLRenderer } from 'three';
import type { RoomTarget } from '../camera/anchors';
import type { RenderLoop } from '../stage/RenderLoop';
import type { ViewportSize } from '../stage/RoomStage';
import type { LitProp } from './PropSpotlight';
import type { SpotlightKit } from './spotlightKit';

/** A prop as the spotlight lights it. */
export interface SpotlitProp {
  readonly target: RoomTarget;
  /** What glows: these objects' meshes (descendants included). */
  readonly glow: readonly Object3D[];
  /** What bounces, as one, about `pivot`; siblings under a parent without rotation or scale. */
  readonly bounce: readonly Object3D[];
  /** The middle of the bouncing part's foot (world space). */
  readonly pivot: Vector3;
  /** The middle of its top (world space), where the label stands. */
  readonly top: Vector3;
}

/** What the lazy chunk gets from the room's: types only cross the seam; the classes come in the kit. */
export interface SpotlightHost {
  readonly kit: SpotlightKit;
  readonly renderer: WebGLRenderer;
  readonly camera: Camera;
  readonly loop: Pick<RenderLoop, 'animate' | 'invalidate'>;
  readonly props: readonly SpotlitProp[];
  readonly reducedMotion: MediaQueryList;
  /** The viewport in CSS px. */
  size(): ViewportSize;
  /**
   * The prop must not move now: the radio until its device has hung its cut parts from the radio's world pose
   * (closeUpAsset.ts). It still glows and has its label.
   */
  still(target: RoomTarget): boolean;
  /** Adds a listener called after every drawn frame; returns its removal. */
  onRender(listener: () => void): () => void;
}

/** The chunk's side: light a prop (or none), and let go of everything. */
export interface Spotlight {
  show(target: RoomTarget | null): void;
  dispose(): void;
}

/** Builds the spotlight; `emit` hears the lit prop and its label point on every change. */
export type CreateSpotlight = (host: SpotlightHost, emit: (lit: LitProp | null) => void) => Spotlight;
