import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { TextureUploader } from '../stage/sceneTextures';
import { type GlassPlane, planeWidth, regionInPixels } from './glassPlane';
import type { RgbColor, ScreenRect, StillPainter } from './PcMonitor';
import { NO_RECT, sameRect } from './screenPlacement';
import type { TextureSize } from './textureTier';

export interface MonitorTextureOptions {
  /** The glass's whole UV square, which the texture covers. */
  readonly glass: GlassPlane;
  /** The picture inside the tube border, where the still goes. */
  readonly picture: GlassPlane;
  /** The picture's corner radius, in metres. */
  readonly pictureRadius: number;
  /** CSS colour of the unlit tube around (and, in standby, instead of) the picture. */
  readonly tubeColor: string;
  readonly renderer: TextureUploader;
  readonly anisotropy: number;
  /** Paint on a CPU canvas, and ask the painter for CPU canvases too (a software GPU: see StillRequest). */
  readonly cpuCanvas: boolean;
  /** The glass finish, drawn over the whole texture after the still; called at the first paint. */
  readonly glassLayer: () => CanvasImageSource;
}

/**
 * What a display's glass shows whenever its live screen does not: one canvas covering the glass's
 * UV square, composited from the tube border, the app's still and the glass finish, and uploaded
 * the moment it is painted so no flight frame ever waits for an upload.
 *
 * It paints rarely and only when asked (see `paintIfDue`), never per frame: in the room view
 * and during flights the still costs nothing but its texture memory.
 */
export class MonitorTexture {
  private readonly standby: DataTexture;
  private canvas: HTMLCanvasElement | null = null;
  private still: CanvasTexture | null = null;
  private painter: StillPainter | null = null;
  /** The painter whose picture is on the canvas, or that failed to paint it. */
  private paintedWith: StillPainter | null = null;
  /** The painter whose `prepare` has been started. */
  private preparedFor: StillPainter | null = null;
  private showingStill = false;
  /** The canvas holds a picture the GPU does not have yet. */
  private uploadDue = false;
  private stale = false;
  private size: TextureSize = { width: 0, height: 0 };
  private placement: ScreenRect = NO_RECT;
  private warned = false;

  constructor(private readonly options: MonitorTextureOptions) {
    this.standby = solidTexture(parseHexColor(options.tubeColor));
  }

  /** The map to show: the still once painted, otherwise the dark 1 × 1 standby tube. */
  get texture(): Texture {
    return this.showingStill && this.still ? this.still : this.standby;
  }

  /** True while the texture shows a painted still (the screen spills light). */
  get painted(): boolean {
    return this.showingStill;
  }

  /** True while a refreshing paint would change something: no picture yet, an outdated one, or one not uploaded. */
  get due(): boolean {
    if (!this.painter) return false;
    const resized = this.canvas?.width !== this.size.width || this.canvas.height !== this.size.height;
    return this.paintedWith !== this.painter || this.stale || resized || this.uploadDue;
  }

  /** Pixels of the still texture in use; 0 in standby. */
  get pixels(): number {
    return this.showingStill && this.canvas ? this.canvas.width * this.canvas.height : 0;
  }

  /** Returns true when the texture changed (a null painter shows the standby tube at once). */
  setPainter(painter: StillPainter | null): boolean {
    this.painter = painter;
    if (painter) return false;
    this.uploadDue = false;
    this.paintedWith = null;
    if (!this.showingStill) return false;
    this.showingStill = false;
    return true;
  }

  /** The still's content changed; it is repainted before the next flight to or from the display. */
  invalidate(): void {
    this.stale = true;
  }

  /**
   * The texture size for the landing and the live screen's placement, for the current viewport.
   * A new placement changes what the painter lays out, so the still goes stale with it.
   */
  setTarget(size: TextureSize, placement: ScreenRect): void {
    if (!sameRect(placement, this.placement)) this.stale = true;
    this.size = size;
    this.placement = placement;
  }

  /**
   * The painter's one-time work ahead of its first paint (`StillPainter.prepare`), once per
   * painter, a unit per `yield`. The paint never depends on it: one that comes first does the
   * rest itself.
   */
  *prepare(): Generator<void, void, void> {
    const painter = this.painter;
    if (!painter?.prepare || this.preparedFor === painter || this.size.width === 0) return;
    this.preparedFor = painter;
    const { width, height } = this.pictureRegion();
    yield* painter.prepare({ width, height, placement: this.placement, cpuCanvas: this.options.cpuCanvas });
  }

  /**
   * Paints if a picture is due and uploads it; true when the texture changed. A painter's first
   * picture is always due. An outdated one (stale, or a new texture size) is due only with
   * `refresh`: in the background, and before flights to or from the display. A flight elsewhere
   * shows the old picture rather than wait for a new one.
   */
  paintIfDue(refresh: boolean): boolean {
    const failed = this.composeIfDue(refresh);
    return this.upload() || failed;
  }

  /**
   * The CPU half of `paintIfDue`: composes a due picture on the canvas, for a later `paintIfDue`
   * to upload. True when the texture changed (the painter threw: standby).
   */
  composeIfDue(refresh: boolean): boolean {
    const painter = this.painter;
    if (!painter || this.size.width === 0) return false;
    if (this.paintedWith === painter) {
      const resized = this.canvas?.width !== this.size.width || this.canvas.height !== this.size.height;
      if (!refresh || !(this.stale || resized)) return false;
    }
    const canvas = this.canvasOfSize(this.size);
    this.paintedWith = painter;
    this.stale = false;
    try {
      // A canvas that cannot give a 2D context fails like a throwing painter: standby.
      const settings = { alpha: false, willReadFrequently: this.options.cpuCanvas };
      this.composite(canvas.getContext('2d', settings) as CanvasRenderingContext2D, painter);
    } catch (error) {
      this.uploadDue = false;
      return this.fail(error);
    }
    this.uploadDue = true;
    return false;
  }

  /** Uploads a composed picture; true when it did (the texture changed). */
  private upload(): boolean {
    if (!this.uploadDue || !this.canvas) return false;
    this.uploadDue = false;
    this.still ??= stillTexture(this.canvas, this.options.anisotropy);
    this.still.needsUpdate = true;
    this.options.renderer.initTexture(this.still);
    this.showingStill = true;
    return true;
  }

  dispose(): void {
    this.standby.dispose();
    this.still?.dispose();
    // Releases the backing store now rather than whenever the canvas is collected.
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
  }

  private composite(context: CanvasRenderingContext2D, painter: StillPainter): void {
    const { glass, pictureRadius, tubeColor } = this.options;
    const { width, height } = this.size;
    const { x, y, ...size } = this.pictureRegion();
    context.fillStyle = tubeColor;
    context.fillRect(0, 0, width, height);
    context.save();
    try {
      roundedRect(context, x, y, size.width, size.height, pictureRadius * (width / planeWidth(glass)));
      context.clip();
      context.translate(x, y);
      painter(context, { ...size, placement: this.placement, cpuCanvas: this.options.cpuCanvas });
    } finally {
      context.restore();
    }
    context.drawImage(this.options.glassLayer(), 0, 0, width, height);
  }

  /** Where the picture inside the tube border lies on the canvas, in canvas px. */
  private pictureRegion(): ReturnType<typeof regionInPixels> {
    return regionInPixels(this.options.glass, this.options.picture, this.size.width, this.size.height);
  }

  private fail(error: unknown): boolean {
    if (!this.warned) {
      this.warned = true;
      console.warn('The monitor still failed to paint; showing the standby tube.', error);
    }
    const changed = this.showingStill;
    this.showingStill = false;
    return changed;
  }

  private canvasOfSize(size: TextureSize): HTMLCanvasElement {
    this.canvas ??= document.createElement('canvas');
    const canvas = this.canvas;
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
      // three allocates immutable texture storage: a new size needs a fresh allocation.
      this.still?.dispose();
    }
    return canvas;
  }
}

function stillTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // glTF UVs put v = 0 at the top, which is also the canvas's first row.
  texture.flipY = false;
  // Mipmaps keep the room-view still from shimmering and give the glow its mean colour (1 × 1 mip).
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = anisotropy;
  return texture;
}

/** A 1 × 1 texture of one sRGB colour: the standby tube, or a light override for the glow. */
export function solidTexture(color: RgbColor): DataTexture {
  const texture = new DataTexture(new Uint8Array(4), 1, 1);
  texture.colorSpace = SRGBColorSpace;
  setSolidColor(texture, color);
  return texture;
}

export function setSolidColor(texture: DataTexture, color: RgbColor): void {
  const data = texture.image.data as Uint8Array;
  data.set([color.r, color.g, color.b, 1].map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255)));
  texture.needsUpdate = true;
}

/** `#rrggbb` as sRGB 0–1. */
function parseHexColor(hex: string): RgbColor {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  // arcTo rather than roundRect: the latter is missing from browsers this site still serves.
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}
