import {
  type Box2,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  type MeshBasicMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
} from 'three';
import { type IdleTask, type IdleTaskOptions, QUIET } from '../../stage/IdleWork';

/**
 * The radio's 2K skin (docs/ROOM.md › The CD player): the radio's own atlas re-baked at 2048², sharp in the frontal
 * view. The bytes (180 KB) download once the close-up has; they are decoded (off the main thread) only once the
 * visitor reaches for the radio; and they go to the GPU a strip at a time, each strip one unit of the room's
 * background work, so no frame waits for a whole 2048² upload (30–40 ms, and 80 ms on a slow phone, in one piece).
 * Strips may go between the floating discs' frames, so the skin is up within moments of the arrival instead of
 * waiting for the radio to come to rest. The decoded image is let go once it is up; a lost context falls back to the
 * 1K atlas and decodes the bytes again.
 */

/** Rows a strip uploads: 2048 × 128 × 4 B = 1 MB, about a millisecond. */
export const SKIN_STRIP_ROWS = 128;

/** What the skin needs of three's renderer. */
export interface SkinRenderer {
  initTexture(texture: Texture): void;
  copyTextureToTexture(source: Texture, target: Texture, region: Box2 | null, position: Vector2 | null): void;
}

export interface SkinOptions {
  readonly renderer: SkinRenderer;
  /** The materials that carry the radio's atlas: they all switch to the skin at once. */
  readonly materials: readonly MeshBasicMaterial[];
  readonly anisotropy: number;
  readonly background: { add(task: IdleTask, options?: IdleTaskOptions): () => void };
  /** How long a strip may wait for an idle period that can hold it, where the room allows (IdleWork's patience). */
  readonly patienceMs?: number;

  /** A frame to show the sharper skin. */
  readonly invalidate: () => void;
  readonly fetchBytes: () => Promise<Blob>;
  readonly decode: (bytes: Blob) => Promise<ImageBitmap>;
}

type Stage = 'idle' | 'fetching' | 'fetched' | 'decoding' | 'uploading' | 'shown' | 'abandoned';

export class Skin {
  #stage: Stage = 'idle';
  #bytes: Blob | null = null;
  #wanted = false;
  #target: DataTexture | null = null;
  #bitmap: ImageBitmap | null = null;
  #cancel: (() => void) | null = null;
  /** The atlas it replaced: kept (its image too) to fall back on if the context is lost. */
  #atlas: Texture | null = null;
  #pixels = 0;

  readonly #options: SkinOptions;

  constructor(options: SkinOptions) {
    this.#options = options;
  }

  /** Pixels of the skin on the GPU (it replaces the radio's 1K atlas there). */
  get pixels(): number {
    return this.#pixels;
  }

  get shown(): boolean {
    return this.#stage === 'shown';
  }

  /** Starts downloading the bytes (after the close-up, so they never hold it up). Idempotent. */
  fetch(): void {
    if (this.#stage !== 'idle') return;
    this.#stage = 'fetching';
    this.#options.fetchBytes().then(
      (bytes) => {
        if (this.#stage !== 'fetching') return;
        this.#bytes = bytes;
        this.#stage = 'fetched';
        if (this.#wanted) this.#decode();
      },
      () => {
        if (this.#stage === 'fetching') this.#stage = 'abandoned';
      },
    );
  }

  /** The visitor reached for the radio (or is on a touch screen): decode and upload once the bytes are here. */
  want(): void {
    this.#wanted = true;
    if (this.#stage === 'fetched') this.#decode();
  }

  /** Not on this device after all (the slow tier): whatever is under way stops, and nothing more happens. */
  abandon(): void {
    if (this.#stage === 'shown') return;
    this.#stop();
    this.#stage = 'abandoned';
    this.#bytes = null;
  }

  /** The context came back with nothing on the GPU: the 1K atlas shows (three uploads it) and the skin goes up again. */
  restore(): void {
    if (this.#stage !== 'shown' && this.#stage !== 'uploading') return;
    this.#stop();
    if (this.#atlas) this.#show(this.#atlas);
    // Its GPU copy went with the old context: disposing it would ask the new one to delete a texture it never had.
    this.#target = null;
    this.#pixels = 0;
    this.#stage = this.#bytes ? 'fetched' : 'abandoned';
    if (this.#wanted) this.#decode();
  }

  dispose(): void {
    this.#stop();
    this.#stage = 'abandoned';
    this.#target?.dispose();
    this.#target = null;
  }

  #decode(): void {
    const bytes = this.#bytes;
    if (!bytes) return;
    this.#stage = 'decoding';
    this.#options.decode(bytes).then(
      (bitmap) => {
        if (this.#stage !== 'decoding') {
          bitmap.close();
          return;
        }
        this.#stage = 'uploading';
        this.#bitmap = bitmap;
        this.#cancel = this.#options.background.add(this.#strips(bitmap), { patienceMs: this.#options.patienceMs });
      },
      () => {
        if (this.#stage === 'decoding') this.#stage = 'abandoned';
      },
    );
  }

  /** One strip per unit of background work; the last one makes the mipmaps, then every material switches. */
  *#strips(bitmap: ImageBitmap): IdleTask {
    const { renderer, anisotropy } = this.#options;
    try {
      // Every strip is an upload: it waits for a quiet moment, or (the task urgent at the radio) goes between frames.
      yield QUIET;
      const { width, height } = bitmap;
      const target = new DataTexture(null, width, height, RGBAFormat, UnsignedByteType);
      // The glTF atlas's settings: no flip, sRGB, mipmaps, the room's anisotropy.
      target.flipY = false;
      target.colorSpace = SRGBColorSpace;
      target.generateMipmaps = true;
      target.minFilter = LinearMipmapLinearFilter;
      target.magFilter = LinearFilter;
      target.anisotropy = anisotropy;
      target.source.dataReady = false;
      this.#target = target;
      // Storage for every level, nothing in it yet. Only a texture marked for upload gets any: unmarked, three binds
      // no texture at all, every strip fails (GL_INVALID_VALUE) and the radio draws black.
      target.needsUpdate = true;
      renderer.initTexture(target);
      yield QUIET;
      const source = new Texture(bitmap);
      const region = { min: new Vector2(), max: new Vector2(), isBox2: true } as unknown as Box2;
      const at = new Vector2();
      for (let row = 0; row < height; row += SKIN_STRIP_ROWS) {
        const last = row + SKIN_STRIP_ROWS >= height;
        region.min.set(0, row);
        region.max.set(width, Math.min(height, row + SKIN_STRIP_ROWS));
        at.set(0, row);
        // The mipmaps only once, with the last strip.
        target.generateMipmaps = last;
        renderer.copyTextureToTexture(source, target, region, at);
        if (!last) yield QUIET;
      }
      target.generateMipmaps = true;
      this.#atlas = this.#options.materials[0]?.map ?? null;
      this.#show(target);
      // Only the old atlas's GPU copy goes: its image stays, to fall back on.
      this.#atlas?.dispose();
      this.#pixels = width * height;
      this.#stage = 'shown';
      this.#cancel = null;
      this.#options.invalidate();
    } finally {
      // Up (or abandoned): the decoded image is no longer needed.
      bitmap.close();
      this.#bitmap = null;
    }
  }

  #show(texture: Texture): void {
    for (const material of this.#options.materials) {
      material.map = texture;
      material.needsUpdate = true;
    }
  }

  #stop(): void {
    this.#cancel?.();
    this.#cancel = null;
    // A task dropped before its end never reaches its `finally`.
    this.#bitmap?.close();
    this.#bitmap = null;
  }
}

/** Downloads the skin's bytes (they stay compressed until it is wanted). */
export async function fetchSkin(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.blob();
}

/** Decodes the skin off the main thread, oriented as glTF textures are. */
export function decodeSkin(bytes: Blob): Promise<ImageBitmap> {
  return createImageBitmap(bytes, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}
