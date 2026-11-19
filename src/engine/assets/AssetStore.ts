import type { PixelImage } from '../gfx/canvas';
import { type PixelData, pixelDataCanvas } from '../gfx/PixelData';

/**
 * Holds images and fonts made ready before the first frame, so scenes can read
 * assets synchronously and never draw a half-loaded frame.
 */
export interface FontSource {
  /** CSS family name to register. */
  readonly family: string;
  readonly url: string;
  readonly descriptors?: FontFaceDescriptors;
}

export class AssetStore {
  readonly #images = new Map<string, PixelImage>();
  readonly #fonts = new Set<string>();

  /**
   * Decodes a picture stored in code (`PixelData`, an `*.art.ts` module's string) onto a canvas, once per key: no
   * request, and ready to draw as soon as this returns. The canvas repaints itself after a lost context.
   */
  addImage(key: string, pixels: PixelData): PixelImage {
    const cached = this.#images.get(key);
    if (cached) return cached;
    let image: PixelImage;
    try {
      image = pixelDataCanvas(pixels);
    } catch (cause) {
      throw new Error(`AssetStore: failed to decode image "${key}"`, { cause });
    }
    this.#images.set(key, image);
    return image;
  }

  /** Registers a self-hosted font with the document and waits until it is usable on canvas. */
  async loadFont(source: FontSource): Promise<void> {
    const id = `${source.family}|${JSON.stringify(source.descriptors ?? {})}`;
    if (this.#fonts.has(id)) return;
    const face = new FontFace(source.family, `url(${JSON.stringify(source.url)})`, source.descriptors);
    try {
      await face.load();
    } catch (cause) {
      throw new Error(`AssetStore: failed to load font "${source.family}" from ${source.url}`, { cause });
    }
    document.fonts.add(face);
    this.#fonts.add(id);
  }

  image(key: string): PixelImage {
    const image = this.#images.get(key);
    if (!image) throw new Error(`AssetStore: image "${key}" was not added`);
    return image;
  }
}
