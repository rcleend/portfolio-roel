import { type Box2, LinearMipmapLinearFilter, SRGBColorSpace, type Texture, type Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { QUIET } from './IdleWork';
import {
  allocateStripTarget,
  STRIP_ROWS,
  type StripRenderer,
  UNPACK_SUBRECT_PARAMETERS,
  uploadStrips,
} from './stripUpload';

function fakeRenderer() {
  const copies: { rows: [number, number]; at: number; mipmaps: boolean }[] = [];
  const allocated: Texture[] = [];
  /** three's state cache: copyTextureToTexture reads the unpack parameters from it, or from the GPU when uncached. */
  const cache = new Map<number, number>();
  const syncs: number[] = [];
  // As three does it: storage only for a texture marked for upload; a copy into one without storage fails.
  const renderer: StripRenderer = {
    state: { pixelStorei: (name, value) => cache.set(name, value) },
    initTexture: (texture) => {
      if (texture.version > 0) allocated.push(texture);
    },
    copyTextureToTexture: (_source: Texture, target: Texture, region: Box2 | null, position: Vector2 | null) => {
      if (!allocated.includes(target)) throw new Error('GL_INVALID_VALUE: the target has no storage');
      for (const name of UNPACK_SUBRECT_PARAMETERS) if (!cache.has(name)) syncs.push(name);
      copies.push({
        rows: [region?.min.y ?? -1, region?.max.y ?? -1],
        at: position?.y ?? -1,
        mipmaps: target.generateMipmaps,
      });
    },
  };
  return { renderer, copies, allocated, cache, syncs };
}

const image = (width: number, height: number) => ({ width, height, close: () => {} }) as unknown as ImageBitmap;

describe('stripUpload', () => {
  it('allocates storage with the glTF atlas settings', () => {
    const { renderer, allocated } = fakeRenderer();
    const target = allocateStripTarget(renderer, 2048, 1024, 4);
    expect(allocated).toEqual([target]);
    expect(target.flipY).toBe(false);
    expect(target.colorSpace).toBe(SRGBColorSpace);
    expect(target.minFilter).toBe(LinearMipmapLinearFilter);
    expect(target.anisotropy).toBe(4);
    expect(target.image).toMatchObject({ width: 2048, height: 1024 });
  });

  it('fills the unpack cache of three with the defaults, so no strip reads one back from the GPU', () => {
    const { renderer, cache, syncs } = fakeRenderer();
    const target = allocateStripTarget(renderer, 2048, 1024, 4);
    expect([...cache.entries()]).toEqual(UNPACK_SUBRECT_PARAMETERS.map((name) => [name, 0]));
    for (const _ of uploadStrips(renderer, image(2048, 1024), target));
    expect(syncs).toEqual([]);
  });

  it('copies 1 MB strips top to bottom, one per unit, mipmaps only with the last', () => {
    const { renderer, copies } = fakeRenderer();
    const target = allocateStripTarget(renderer, 2048, 1024, 4);
    const task = uploadStrips(renderer, image(2048, 1024), target);
    const yields: unknown[] = [];
    for (let result = task.next(); !result.done; result = task.next()) yields.push(result.value);
    expect(copies).toHaveLength(1024 / STRIP_ROWS);
    expect(copies.map((copy) => copy.rows)).toEqual(
      Array.from({ length: 8 }, (_, k) => [k * STRIP_ROWS, (k + 1) * STRIP_ROWS]),
    );
    expect(copies.map((copy) => copy.at)).toEqual(copies.map((copy) => copy.rows[0]));
    expect(copies.map((copy) => copy.mipmaps)).toEqual([false, false, false, false, false, false, false, true]);
    // Seven strips wait for the next unit; the last one ends the task.
    expect(yields).toEqual(Array(7).fill(QUIET));
    expect(target.generateMipmaps).toBe(true);
  });

  it('clips the last strip to the image and leaves mipmaps on when dropped mid-way', () => {
    const { renderer, copies } = fakeRenderer();
    const target = allocateStripTarget(renderer, 1024, 300, 1);
    const task = uploadStrips(renderer, image(1024, 300), target);
    for (let result = task.next(); !result.done; result = task.next());
    expect(copies.map((copy) => copy.rows)).toEqual([
      [0, 128],
      [128, 256],
      [256, 300],
    ]);
    const dropped = uploadStrips(renderer, image(1024, 300), target);
    dropped.next();
    expect(target.generateMipmaps).toBe(false);
    dropped.return();
    expect(target.generateMipmaps).toBe(true);
  });
});
