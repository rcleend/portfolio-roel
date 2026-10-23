import type { LevelId } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { ParallaxLayer } from '@/engine/gfx/Parallax';
import { type LevelArtManifest, type PropSpec, parseLevelArtManifest, type TilesetSpec } from './manifest';

/** Everything needed to paint one stage: parallax planes, play-plane tiles and props. */
export interface LevelArt {
  readonly levelId: LevelId;
  readonly groundY: number;
  /** Drawn before the play plane, back to front. */
  readonly background: readonly ParallaxLayer[];
  /** Drawn after the play plane (sparse silhouettes passing in front of the player). */
  readonly foreground: readonly ParallaxLayer[];
  readonly tileset: Tileset;
  readonly props: Readonly<Record<string, PropSheet>>;
  readonly palette: readonly string[];
}

/** A grid of named square tiles. */
export class Tileset {
  readonly #image: HTMLImageElement;
  readonly #spec: TilesetSpec;

  constructor(image: HTMLImageElement, spec: TilesetSpec) {
    this.#image = image;
    this.#spec = spec;
  }

  get tileSize(): number {
    return this.#spec.tileSize;
  }

  has(name: string): boolean {
    return name in this.#spec.tiles;
  }

  /** Draws tile `name` with its top-left corner at (x, y). */
  draw(gfx: Gfx, name: string, x: number, y: number): void {
    const cell = this.#spec.tiles[name];
    if (!cell) throw new Error(`Tileset: unknown tile "${name}"`);
    const size = this.#spec.tileSize;
    gfx.image(this.#image, x, y, { source: { x: cell[0] * size, y: cell[1] * size, w: size, h: size } });
  }
}

/** A horizontal strip of equally sized prop frames. */
export class PropSheet {
  readonly #image: HTMLImageElement;
  readonly #spec: PropSpec;

  constructor(image: HTMLImageElement, spec: PropSpec) {
    this.#image = image;
    this.#spec = spec;
  }

  get width(): number {
    return this.#spec.w;
  }

  get height(): number {
    return this.#spec.h;
  }

  get frames(): number {
    return this.#spec.frames;
  }

  /** Draws `frame` (wrapped) with its top-left corner at (x, y). */
  draw(gfx: Gfx, x: number, y: number, frame = 0, options: { flipX?: boolean; alpha?: number } = {}): void {
    const { w, h, frames } = this.#spec;
    const index = ((Math.floor(frame) % frames) + frames) % frames;
    gfx.image(this.#image, x, y, { ...options, source: { x: index * w, y: 0, w, h } });
  }
}

/** Read-only access to every stage's art once `loadLevelArt` has resolved. */
export interface LevelArtLibrary {
  get(levelId: LevelId): LevelArt;
}

// Bundled by Vite: every level folder's manifest and the URLs of its PNGs.
const manifestModules = import.meta.glob<unknown>('../*/art/layers.json', { eager: true, import: 'default' });
const imageUrls = import.meta.glob<string>('../*/art/*.png', { eager: true, query: '?url', import: 'default' });

/** Parses every bundled manifest without touching the network (also used by tests). */
export function bundledManifests(): ReadonlyMap<LevelId, LevelArtManifest> {
  const manifests = new Map<LevelId, LevelArtManifest>();
  for (const [path, raw] of Object.entries(manifestModules)) {
    const manifest = parseLevelArtManifest(raw, path);
    manifests.set(manifest.levelId, manifest);
  }
  return manifests;
}

/** Preloads every stage's images into `assets` and returns a synchronous library. */
export async function loadLevelArt(assets: AssetStore): Promise<LevelArtLibrary> {
  const library = new Map<LevelId, LevelArt>();
  await Promise.all(
    [...bundledManifests()].map(async ([levelId, manifest]) => {
      const load = (file: string) => {
        const url = imageUrls[`../${levelId}/art/${file}`];
        if (!url) throw new Error(`Level art: ${levelId}/art/${file} is referenced by layers.json but missing`);
        return assets.loadImage(`level/${levelId}/${file}`, url);
      };
      const layerImages = await Promise.all(manifest.layers.map((layer) => load(layer.file)));
      const toLayer = (index: number): ParallaxLayer => {
        const spec = manifest.layers[index];
        const image = layerImages[index];
        if (!spec || !image) throw new Error(`Level art: layer ${index} of ${levelId} failed to load`);
        return { image, factor: spec.factor, y: spec.y, repeatX: spec.repeatX };
      };
      const indices = manifest.layers.map((_, index) => index);
      const props = await Promise.all(
        Object.entries(manifest.props).map(
          async ([name, spec]) => [name, new PropSheet(await load(spec.file), spec)] as const,
        ),
      );
      library.set(levelId, {
        levelId,
        groundY: manifest.groundY,
        background: indices.filter((index) => !manifest.layers[index]?.foreground).map(toLayer),
        foreground: indices.filter((index) => manifest.layers[index]?.foreground).map(toLayer),
        tileset: new Tileset(await load(manifest.tileset.file), manifest.tileset),
        props: Object.fromEntries(props),
        palette: manifest.palette,
      });
    }),
  );
  return {
    get(levelId) {
      const art = library.get(levelId);
      if (!art) throw new Error(`Level art: no art bundled for "${levelId}"`);
      return art;
    },
  };
}
