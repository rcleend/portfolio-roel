import type { Vec2 } from '../math/Vec2';
import type { PixelImage } from './canvas';
import { createCanvas, paintCanvas } from './canvas';
import { type AtlasFrame, compilePixelArt, type PixelArtSheet } from './PixelArt';
import { type SpriteAnimationSpec, type SpriteSheetSpec, specImageSize } from './SpriteSheetSpec';

export interface SpriteDrawOptions {
  /** Mirror horizontally around the origin, e.g. to face left. */
  readonly flipX?: boolean;
  /** 0–1. Prefer whole-sprite blinking over partial alpha for an authentic look. */
  readonly alpha?: number;
  /** Paint every opaque pixel in this solid colour — the classic hit flash. */
  readonly flash?: string;
}

/**
 * Everything a sheet plays from: one image holding every frame, the frame
 * size and origin, and where each animation's frames sit in the image.
 * Pixel art compiles to one; an image sheet's PNG already is one.
 */
export interface SpriteAtlas<A extends string = string> {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly origin: Vec2;
  readonly atlas: PixelImage;
  readonly animations: Readonly<Record<A, AtlasAnimation>>;
}

export interface AtlasAnimation {
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly AtlasFrame[];
  /** Named pixels per frame, in frame pixels. */
  readonly anchors?: Readonly<Record<string, readonly Vec2[]>>;
}

const NO_ANCHORS: readonly Vec2[] = [];

/**
 * A sprite sheet with time-based animation playback, drawn the same way
 * whether it was authored as pixel art or shipped as a PNG with its JSON.
 *
 * Playback is a pure function of time, so scenes only need to keep their own
 * clock: `sheet.frameIndex('run', this.time - runStartedAt)`.
 */
export class SpriteSheet<A extends string = string> {
  readonly #art: SpriteAtlas<A>;
  readonly #flashAtlases = new Map<string, HTMLCanvasElement>();

  private constructor(art: SpriteAtlas<A>) {
    this.#art = art;
  }

  static compile<A extends string>(sheet: PixelArtSheet<A>, name: string): SpriteSheet<A> {
    return new SpriteSheet(compilePixelArt(sheet, name));
  }

  /**
   * A sheet over a decoded PNG laid out as `spec` describes. The image must be
   * exactly the size the spec implies, which catches a JSON that drifted from
   * its PNG. Animation names are unchecked here; callers narrow `A` once they
   * have checked the names they need.
   */
  static fromImage(image: PixelImage, spec: SpriteSheetSpec, name: string): SpriteSheet<string> {
    const expected = specImageSize(spec);
    if (image.width !== expected.w || image.height !== expected.h) {
      throw new Error(
        `SpriteSheet "${name}": the image is ${image.width}×${image.height}, but its JSON describes ` +
          `${expected.w}×${expected.h} (${spec.animations.length} rows of ${spec.frame.w}×${spec.frame.h} frames)`,
      );
    }
    const { w, h } = spec.frame;
    const animations: Record<string, AtlasAnimation> = {};
    spec.animations.forEach((animation: SpriteAnimationSpec, row) => {
      const frames = Array.from({ length: animation.frames }, (_, column) => ({ x: column * w, y: row * h }));
      animations[animation.name] = { fps: animation.fps, loop: animation.loop, frames, anchors: animation.anchors };
    });
    return new SpriteSheet({ name, width: w, height: h, origin: spec.origin, atlas: image, animations });
  }

  get name(): string {
    return this.#art.name;
  }

  get width(): number {
    return this.#art.width;
  }

  get height(): number {
    return this.#art.height;
  }

  get origin(): Vec2 {
    return this.#art.origin;
  }

  get animationNames(): readonly A[] {
    return Object.keys(this.#art.animations) as A[];
  }

  has(animation: string): animation is A {
    return Object.hasOwn(this.#art.animations, animation);
  }

  /** True when the sheet has every one of `animations`, which then narrows its type. */
  hasAll<N extends string>(animations: readonly N[]): this is SpriteSheet<N> {
    return animations.every((animation) => this.has(animation));
  }

  frameCount(animation: A): number {
    return this.#animation(animation).frames.length;
  }

  /** Length of one pass through the animation, in seconds. */
  duration(animation: A): number {
    const { frames, fps } = this.#animation(animation);
    return frames.length / fps;
  }

  /** True once a non-looping animation has shown its last frame for a full frame time. */
  isFinished(animation: A, time: number): boolean {
    const { loop } = this.#animation(animation);
    return !loop && time >= this.duration(animation);
  }

  frameIndex(animation: A, time: number): number {
    const { frames, fps, loop } = this.#animation(animation);
    const raw = Math.floor(Math.max(0, time) * fps + 1e-9);
    return loop ? raw % frames.length : Math.min(raw, frames.length - 1);
  }

  /** The anchor `name` of the frame shown at `time`, in frame pixels; null where the animation has none. */
  anchor(animation: A, name: string, time: number): Vec2 | null {
    const points = this.#animation(animation).anchors?.[name];
    return points?.[this.frameIndex(animation, time)] ?? null;
  }

  /** Anchor `name` of every frame of the animation, in frame order and frame pixels; empty where it has none. */
  anchors(animation: A, name: string): readonly Vec2[] {
    return this.#animation(animation).anchors?.[name] ?? NO_ANCHORS;
  }

  /**
   * The screen pixel showing frame pixel `point` when the sheet is drawn with
   * its origin at (x, y) — rounded like `gfx.sprite`, and mirrored with the
   * sprite, so an effect pinned to an anchor stays on the same art pixel.
   */
  toScreen(point: Vec2, x: number, y: number, flipX = false): Vec2 {
    const { origin } = this.#art;
    const left = Math.round(x);
    return {
      x: flipX ? left + origin.x - 1 - point.x : left - origin.x + point.x,
      y: Math.round(y) - origin.y + point.y,
    };
  }

  /** Draws the frame for `time` with its origin at (x, y). Coordinates must already be integers. */
  draw(
    ctx: CanvasRenderingContext2D,
    animation: A,
    time: number,
    x: number,
    y: number,
    options?: SpriteDrawOptions,
  ): void {
    this.drawFrame(ctx, animation, this.frameIndex(animation, time), x, y, options);
  }

  drawFrame(
    ctx: CanvasRenderingContext2D,
    animation: A,
    frameIndex: number,
    x: number,
    y: number,
    options: SpriteDrawOptions = {},
  ): void {
    const { frames } = this.#animation(animation);
    const frame = frames[Math.min(Math.max(0, frameIndex), frames.length - 1)] as AtlasFrame;
    const { width, height, origin } = this.#art;
    const atlas = options.flash ? this.#flashAtlas(options.flash) : this.#art.atlas;
    const alpha = options.alpha ?? 1;
    if (alpha <= 0) return;

    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;
    if (options.flipX) {
      // Mirror around the origin so the feet stay planted when the sprite turns around.
      ctx.translate(x + origin.x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(atlas, frame.x, frame.y, width, height, 0, -origin.y, width, height);
    } else {
      ctx.drawImage(atlas, frame.x, frame.y, width, height, x - origin.x, y - origin.y, width, height);
    }
    ctx.restore();
  }

  #animation(animation: A): AtlasAnimation {
    const found = this.#art.animations[animation];
    if (!found) throw new Error(`SpriteSheet "${this.name}" has no animation "${animation}"`);
    return found;
  }

  /** Silhouette atlas in a solid colour, built once per colour on first use. */
  #flashAtlas(color: string): HTMLCanvasElement {
    let atlas = this.#flashAtlases.get(color);
    if (!atlas) {
      const source = this.#art.atlas;
      atlas = createCanvas(source.width, source.height);
      paintCanvas(atlas, (ctx) => {
        ctx.drawImage(source, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, source.width, source.height);
      });
      this.#flashAtlases.set(color, atlas);
    }
    return atlas;
  }
}
