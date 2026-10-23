import {
  type BufferAttribute,
  type DataTexture,
  Float32BufferAttribute,
  type InterleavedBufferAttribute,
  type Material,
  type MeshBasicMaterial,
  type Object3D,
  Vector3,
} from 'three';
import type { Viewpoint } from '../camera/cameraPath';
import type { IdleTask, IdleWork } from '../stage/IdleWork';
import type { ViewportSize } from '../stage/RoomStage';
import type { TextureUploader } from '../stage/sceneTextures';
import { ScreenGlow } from '../tv/ScreenGlow';
import type { RoomView } from '../viewState';
import { paintGlassLayer } from './glassLayer';
import { planeHeight, planeWidth, regionInPixels } from './glassPlane';
import { MonitorTexture, setSolidColor, solidTexture } from './MonitorTexture';
import { bezelEmitter, monitorGlowPatches } from './monitorGlow';
import type { RgbColor, StillPainter } from './PcMonitor';
import { PC_PICTURE_RADIUS, PC_TUBE_COLOR, type PcModel } from './pcModel';
import { projectorUvs } from './projectorUvs';
import type { ScreenOverlay } from './ScreenOverlay';
import { screenPlacement } from './screenPlacement';
import { textureTier } from './textureTier';

export interface MonitorOptions {
  readonly model: PcModel;
  /** Where the light-spill patches are added. */
  readonly scene: Object3D;
  readonly loop: { invalidate(): void };
  readonly renderer: TextureUploader;
  readonly anisotropy: number;
  readonly overlay: ScreenOverlay;
  /** The settled pose at the computer for the current viewport. */
  readonly pose: Viewpoint;
  /** True while the glass can be on screen: any view but a settled TV. */
  readonly isInView: () => boolean;
  /** Where the still is painted ahead of the flights that show it. */
  readonly background: Pick<IdleWork, 'add'>;
}

/** Width of the shared glass-finish canvas; its height follows the glass's aspect. */
const GLASS_LAYER_WIDTH = 256;
/** A projected picture this far off a rectangle means pc-base.glb's glass no longer faces +Z. */
const MAX_SKEW_PX = 0.5;

/**
 * The computer's monitor as one device: the glass's still texture, the light it spills on the
 * bezel, desk and keyboard, the registration that lines the still up with the live DOM screen,
 * and that screen's placement.
 *
 * The glass keeps its baked unlit material (cloned, with only its map swapped), so the monitor
 * adds no shader program, and nothing here runs per frame: the still is painted in the background
 * ahead of the flights that show it, and the room renders nothing at all while the visitor sits
 * at the computer.
 */
export class Monitor {
  private readonly material: MeshBasicMaterial;
  private readonly originalMaterial: Material | Material[];
  private readonly originalUv: BufferAttribute | InterleavedBufferAttribute;
  private readonly projectedUv: Float32BufferAttribute;
  /** The glass's vertices in world space, x, y, z each; the mesh never moves. */
  private readonly worldPositions: Float32Array;
  private readonly still: MonitorTexture;
  private readonly glow: ScreenGlow;
  private readonly lightTexture: DataTexture;
  private light: RgbColor | null = null;
  private layer: HTMLCanvasElement | null = null;
  private readonly layerHeight: number;
  /** Drops the queued background paint, if one is queued. */
  private cancelPaint: (() => void) | null = null;
  private warnedSkew = false;

  constructor(private readonly options: MonitorOptions) {
    const { model, overlay } = options;
    const { glass } = model;
    // KHR_materials_unlit, which `pnpm verify:room` asserts for every static surface, loads as a
    // MeshBasicMaterial; a clone with the same parameters compiles to the same program as every
    // baked surface in the room.
    const baked = glass.material as MeshBasicMaterial;
    this.originalMaterial = baked;
    this.material = baked.clone();
    releaseBakedPicture(baked);

    this.still = new MonitorTexture({
      glass: model.rim,
      picture: model.picture,
      pictureRadius: PC_PICTURE_RADIUS,
      tubeColor: PC_TUBE_COLOR,
      renderer: options.renderer,
      anisotropy: options.anisotropy,
      glassLayer: this.glassLayer,
    });
    this.material.map = this.still.texture;
    glass.material = this.material;

    this.worldPositions = worldPositionsOf(model);
    this.originalUv = glass.geometry.getAttribute('uv');
    this.projectedUv = new Float32BufferAttribute(new Float32Array((this.worldPositions.length / 3) * 2), 2);
    glass.geometry.setAttribute('uv', this.projectedUv);

    this.lightTexture = solidTexture({ r: 0, g: 0, b: 0 });
    this.glow = new ScreenGlow(options.scene, this.still.texture, monitorGlowPatches(model, options.pose.position));
    this.layerHeight = Math.ceil(GLASS_LAYER_WIDTH / (planeWidth(model.rim) / planeHeight(model.rim)));
    overlay.setFinish({
      canvas: this.glassLayer,
      picture: regionInPixels(model.rim, model.picture, GLASS_LAYER_WIDTH, this.layerHeight),
    });
  }

  /** Pixels of the still texture in use; 0 in standby. */
  get texturePixels(): number {
    return this.still.pixels;
  }

  /**
   * The settled pose at the computer changed (a resize): re-registers the still with the page and
   * re-places the live screen.
   */
  setPose(pose: Viewpoint, viewport: ViewportSize): void {
    const { model, overlay } = this.options;
    const eye = pose.position;
    this.projectedUv.copyArray(projectorUvs(this.worldPositions, eye, model.rim));
    this.projectedUv.needsUpdate = true;
    const emitter = bezelEmitter(model, eye);
    this.glow.setEmitter(0, emitter.centre, emitter.halfSize, emitter.radius);

    const placement = screenPlacement(model.picture, PC_PICTURE_RADIUS, pose, viewport, window.devicePixelRatio || 1);
    if (import.meta.env.DEV && placement.skew > MAX_SKEW_PX && !this.warnedSkew) {
      this.warnedSkew = true;
      console.warn(`The PC picture projects ${placement.skew.toFixed(2)} px off a rectangle; did pc-base.glb turn?`);
    }
    overlay.setPlacement(placement.rect, placement.radius);
    const glassWidth = placement.rect.width * (planeWidth(model.rim) / planeWidth(model.picture));
    const aspect = planeWidth(model.rim) / planeHeight(model.rim);
    // `navigator.deviceMemory`: GB, coarse, Chromium only.
    const memory = (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
    this.still.setTarget(textureTier(glassWidth * viewport.pixelRatio, aspect, memory), placement.rect);
    if (this.options.isInView()) this.paintSoon();
    this.options.loop.invalidate();
  }

  /** Called before every flight, from the view the camera was at (or flying to) towards `to`. */
  prepare(from: RoomView, to: RoomView): void {
    // The background has normally painted already; a flight that starts before it does paints now.
    if (this.still.paintIfDue(from === 'pc' || to === 'pc')) this.sync();
    // A still that went stale while the glass was out of sight is repainted once the camera lands.
    if (to !== 'tv') this.paintSoon();
  }

  setStill(painter: StillPainter | null): void {
    if (this.still.setPainter(painter)) this.sync();
    // Painted now, while the glass is out of sight at the TV, the first leave from the TV is free.
    if (painter) this.paintSoon();
  }

  invalidateStill(): void {
    this.still.invalidate();
    if (this.options.isInView()) this.paintSoon();
  }

  setLight(color: RgbColor | null): void {
    if (sameColor(color, this.light)) return;
    this.light = color;
    if (color) setSolidColor(this.lightTexture, color);
    this.sync();
  }

  dispose(): void {
    this.cancelPaint?.();
    const { glass } = this.options.model;
    glass.material = this.originalMaterial;
    glass.geometry.setAttribute('uv', this.originalUv);
    this.material.dispose();
    this.still.dispose();
    this.glow.dispose();
    this.lightTexture.dispose();
    if (this.layer) this.layer.width = this.layer.height = 0;
  }

  /** Queues a background paint of whatever is due, unless one is queued already. */
  private paintSoon(): void {
    this.cancelPaint ??= this.options.background.add(this.paintAhead());
  }

  private *paintAhead(): IdleTask {
    // The glass finish on its own: it is 14 ms of a slow phone's main thread.
    this.glassLayer();
    yield;
    this.cancelPaint = null;
    if (this.still.paintIfDue(true)) this.sync();
  }

  /** Shows what the still texture and the light override say, in one frame. */
  private sync(): void {
    this.material.map = this.still.texture;
    this.glow.setPicture(this.light ? this.lightTexture : this.still.texture);
    this.glow.setLit(this.still.painted || this.light ? 1 : 0);
    this.options.loop.invalidate();
  }

  /** The glass finish, painted the first time anything needs it and shared with the live screen. */
  private readonly glassLayer = (): HTMLCanvasElement => {
    if (this.layer) return this.layer;
    const canvas = document.createElement('canvas');
    canvas.width = GLASS_LAYER_WIDTH;
    canvas.height = this.layerHeight;
    const context = canvas.getContext('2d');
    if (context) {
      const image = context.createImageData(canvas.width, canvas.height);
      paintGlassLayer(image);
      context.putImageData(image, 0, 0);
    }
    this.layer = canvas;
    return canvas;
  };
}

/**
 * The asset ships a baked 2048² desktop picture on the glass. It is replaced before any frame
 * shows the computer, so release it before it is ever uploaded (≈ 18 MB of GPU memory with mips).
 */
function releaseBakedPicture(material: MeshBasicMaterial): void {
  const map = material.map;
  // An ImageBitmap (GLTFLoader's choice where available) holds its pixels until closed.
  (map?.image as Partial<ImageBitmap> | null)?.close?.();
  map?.dispose();
  material.map = null;
}

function worldPositionsOf(model: PcModel): Float32Array {
  const { glass } = model;
  glass.updateWorldMatrix(true, false);
  const positions = glass.geometry.getAttribute('position');
  const world = new Float32Array(positions.count * 3);
  const point = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    point
      .fromBufferAttribute(positions, i)
      .applyMatrix4(glass.matrixWorld)
      .toArray(world, i * 3);
  }
  return world;
}

function sameColor(a: RgbColor | null, b: RgbColor | null): boolean {
  if (!a || !b) return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
