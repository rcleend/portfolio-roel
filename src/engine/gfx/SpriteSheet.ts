import { context2d, createCanvas } from './canvas';
import { type AtlasFrame, type CompiledPixelArt, compilePixelArt, type PixelArtSheet } from './PixelArt';

export interface SpriteDrawOptions {
  /** Mirror horizontally around the origin, e.g. to face left. */
  readonly flipX?: boolean;
  /** 0–1. Prefer whole-sprite blinking over partial alpha for an authentic look. */
  readonly alpha?: number;
  /** Paint every opaque pixel in this solid colour — the classic hit flash. */
  readonly flash?: string;
}

/**
 * A compiled pixel-art sheet with time-based animation playback.
 *
 * Playback is a pure function of time, so scenes only need to keep their own
 * clock: `sheet.frameIndex('run', this.time - runStartedAt)`.
 */
export class SpriteSheet<A extends string = string> {
  readonly #art: CompiledPixelArt<A>;
  readonly #flashAtlases = new Map<string, HTMLCanvasElement>();

  private constructor(art: CompiledPixelArt<A>) {
    this.#art = art;
  }

  static compile<A extends string>(sheet: PixelArtSheet<A>, name: string): SpriteSheet<A> {
    return new SpriteSheet(compilePixelArt(sheet, name));
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

  get origin(): { readonly x: number; readonly y: number } {
    return this.#art.origin;
  }

  get animationNames(): readonly A[] {
    return Object.keys(this.#art.animations) as A[];
  }

  has(animation: string): animation is A {
    return Object.hasOwn(this.#art.animations, animation);
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

  #animation(animation: A) {
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
      const ctx = context2d(atlas);
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, atlas.width, atlas.height);
      this.#flashAtlases.set(color, atlas);
    }
    return atlas;
  }
}
