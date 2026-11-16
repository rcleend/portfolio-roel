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
import { onCanvasRestored } from '../stage/canvasRestore';
import { type IdleTask, type IdleWork, QUIET } from '../stage/IdleWork';
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
  /** Paint the still and the glass finish on CPU canvases (a software GPU). */
  readonly cpuCanvases: boolean;
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
/** Rows of the glass finish painted per unit of background work: a few ms on a slow phone. */
const FINISH_BAND_ROWS = 32;
/** A projected picture this far off a rectangle means the glass no longer faces +Z. */
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
  /** The glass finish, shared with the live screen; painted in bands by `finishing`. */
  private readonly layer = document.createElement('canvas');
  private finishing = this.paintFinish();
  private readonly layerHeight: number;
  /** Drops the queued background paint, if one is queued. */
  private cancelPaint: (() => void) | null = null;
  private readonly cancelFinish: () => void;
  private readonly stopRestore: () => void;
  private warnedSkew = false;

  constructor(private readonly options: MonitorOptions) {
    const { model, overlay } = options;
    const { glass } = model;
    // The glass's own unlit material (pcGlass.ts): a clone compiles to the same program as every baked surface's.
    const baked = glass.material as MeshBasicMaterial;
    this.originalMaterial = baked;
    this.material = baked.clone();

    this.still = new MonitorTexture({
      glass: model.rim,
      picture: model.picture,
      pictureRadius: PC_PICTURE_RADIUS,
      tubeColor: PC_TUBE_COLOR,
      renderer: options.renderer,
      anisotropy: options.anisotropy,
      cpuCanvas: options.cpuCanvases,
      glassLayer: this.glassLayer,
      restored: () => this.repaintStill(),
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
    // Room work that needs no app code: done while the TV is still dark, before anything plays.
    this.cancelFinish = options.background.add(this.finishAhead());
    // A GPU reset gives the finish back blank: the live screen's overlay shows it, and the still is composed with it.
    this.stopRestore = onCanvasRestored(this.layer, () => {
      this.finishing = this.paintFinish();
      this.glassLayer();
      this.still.invalidate();
      this.repaintStill();
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
    // A flight the background has not painted for yet (always, on a device too slow to prepare the
    // still between the game's frames) paints now, while the camera has not moved.
    if (this.still.paintIfDue(from === 'pc' || to === 'pc')) this.sync();
    // A still that went stale while the glass was out of sight is repainted once the camera lands.
    if (to !== 'tv') this.paintSoon();
  }

  /**
   * The camera landed at the computer. A still that went stale on the way (a resize, the clock's
   * minute) is repainted before the landing frame, so the live screen fades in over its twin.
   */
  land(): void {
    if (this.still.paintIfDue(true)) this.sync();
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
    this.cancelFinish();
    this.stopRestore();
    this.cancelPaint?.();
    const { glass } = this.options.model;
    glass.material = this.originalMaterial;
    glass.geometry.setAttribute('uv', this.originalUv);
    this.material.dispose();
    this.still.dispose();
    this.glow.dispose();
    this.lightTexture.dispose();
    this.layer.width = this.layer.height = 0;
  }

  /** Queues a background paint of whatever is due, unless nothing is or one is queued already. */
  private paintSoon(): void {
    if (this.still.due) this.cancelPaint ??= this.options.background.add(this.paintAhead());
  }

  /** The glass finish as background work: 17-50 ms on a phone twenty times slower than a laptop, so in bands. */
  private *finishAhead(): IdleTask {
    yield* this.finishing;
  }

  private *paintFinish(): Generator<void, void, void> {
    const canvas = this.layer;
    canvas.width = GLASS_LAYER_WIDTH;
    canvas.height = this.layerHeight;
    const context = canvas.getContext('2d', { willReadFrequently: this.options.cpuCanvases });
    if (!context) return;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let row = 0; row < canvas.height; row += FINISH_BAND_ROWS) {
      if (row > 0) yield;
      paintGlassLayer(image, row, row + FINISH_BAND_ROWS);
    }
    context.putImageData(image, 0, 0);
  }

  private *paintAhead(): IdleTask {
    // The painter's preparation and the composition are CPU work in small units, which may go
    // between the game's frames; the upload waits until nothing plays, or for the flight.
    yield* this.still.prepare();
    yield;
    if (this.still.composeIfDue(true)) this.sync();
    yield QUIET;
    this.cancelPaint = null;
    if (this.still.paintIfDue(true)) this.sync();
  }

  /**
   * After a GPU reset, composes the still again at once (a few ms, once): the glass shows it in every view, and the
   * restored context would otherwise upload the blank canvas.
   */
  private repaintStill(): void {
    if (this.still.paintIfDue(true)) this.sync();
    this.options.loop.invalidate();
  }

  /** Shows what the still texture and the light override say, in one frame. */
  private sync(): void {
    this.material.map = this.still.texture;
    this.glow.setPicture(this.light ? this.lightTexture : this.still.texture);
    this.glow.setLit(this.still.painted || this.light ? 1 : 0);
    this.options.loop.invalidate();
  }

  /** The finished glass finish: whatever needs it first paints the bands the background has not. */
  private readonly glassLayer = (): HTMLCanvasElement => {
    let step = this.finishing.next();
    while (!step.done) step = this.finishing.next();
    return this.layer;
  };
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
