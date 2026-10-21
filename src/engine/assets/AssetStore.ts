/**
 * Preloads images and fonts before the first frame, so scenes can read
 * assets synchronously and never draw a half-loaded frame.
 */
export interface FontSource {
  /** CSS family name to register. */
  readonly family: string;
  readonly url: string;
  readonly descriptors?: FontFaceDescriptors;
}

export class AssetStore {
  readonly #images = new Map<string, HTMLImageElement>();
  readonly #fonts = new Set<string>();

  /** Loads and decodes an image; resolves once it can be drawn without a flash. */
  async loadImage(key: string, url: string): Promise<HTMLImageElement> {
    const cached = this.#images.get(key);
    if (cached) return cached;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try {
      await image.decode();
    } catch (cause) {
      throw new Error(`AssetStore: failed to load image "${key}" from ${url}`, { cause });
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

  async preload(manifest: {
    readonly images?: Readonly<Record<string, string>>;
    readonly fonts?: readonly FontSource[];
  }): Promise<void> {
    await Promise.all([
      ...Object.entries(manifest.images ?? {}).map(([key, url]) => this.loadImage(key, url)),
      ...(manifest.fonts ?? []).map((font) => this.loadFont(font)),
    ]);
  }

  image(key: string): HTMLImageElement {
    const image = this.#images.get(key);
    if (!image) throw new Error(`AssetStore: image "${key}" was not preloaded`);
    return image;
  }

  hasImage(key: string): boolean {
    return this.#images.has(key);
  }
}
