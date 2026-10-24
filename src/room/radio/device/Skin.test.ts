import { type Box2, MeshBasicMaterial, Texture, type Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type IdleTask, QUIET } from '../../stage/IdleWork';
import { SKIN_STRIP_ROWS, Skin, type SkinRenderer } from './Skin';

function setup(options: { readonly fail?: 'fetch' | 'decode' } = {}) {
  const copies: { rows: [number, number]; at: number; mipmaps: boolean }[] = [];
  const allocated: Texture[] = [];
  // As three does it: initTexture gives a texture storage only when it is marked for upload (version > 0), and a
  // copy into a texture without storage fails (in WebGL, GL_INVALID_VALUE into whatever is bound: the radio black).
  const renderer: SkinRenderer = {
    initTexture: (texture) => {
      if (texture.version > 0) allocated.push(texture);
    },
    copyTextureToTexture: (_source: Texture, target: Texture, region: Box2 | null, position: Vector2 | null) => {
      if (!allocated.includes(target)) throw new Error('GL_INVALID_VALUE: the target has no storage');
      copies.push({
        rows: [region?.min.y ?? -1, region?.max.y ?? -1],
        at: position?.y ?? -1,
        mipmaps: target.generateMipmaps,
      });
    },
  };
  const atlasImage = { width: 1024, height: 1024, close: vi.fn() };
  const atlas = new Texture(atlasImage as never);
  const dispose = vi.spyOn(atlas, 'dispose');
  const materials = [new MeshBasicMaterial({ map: atlas }), new MeshBasicMaterial({ map: atlas })];
  const tasks: IdleTask[] = [];
  const bitmap = { width: 2048, height: 2048, close: vi.fn() } as unknown as ImageBitmap;
  let resolveBytes: (bytes: Blob) => void = () => {};
  const skin = new Skin({
    renderer,
    materials,
    anisotropy: 4,
    background: {
      add: (task) => {
        tasks.push(task);
        return () => tasks.splice(tasks.indexOf(task), 1);
      },
    },
    invalidate: vi.fn(),
    fetchBytes: () =>
      options.fail === 'fetch'
        ? Promise.reject(new Error('offline'))
        : new Promise<Blob>((resolve) => {
            resolveBytes = resolve;
          }),
    decode: () => (options.fail === 'decode' ? Promise.reject(new Error('bad')) : Promise.resolve(bitmap)),
  });
  /** What each unit yielded: whether the next waits for a quiet moment. */
  const yields: unknown[] = [];
  /** Runs queued background units one at a time, as the room's idle work would. */
  const runUnits = (limit = 100) => {
    let units = 0;
    while (tasks.length > 0 && units < limit) {
      const task = tasks[0] as IdleTask;
      units++;
      const result = task.next();
      if (result.done) tasks.shift();
      else yields.push(result.value);
    }
    return units;
  };
  return {
    skin,
    copies,
    allocated,
    atlas,
    atlasImage,
    dispose,
    materials,
    tasks,
    bitmap,
    runUnits,
    yields,
    bytes: () => resolveBytes(new Blob()),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Skin', () => {
  it('waits for the visitor to want it: the bytes download, but nothing is decoded or uploaded', async () => {
    const { skin, tasks, bytes } = setup();
    skin.fetch();
    bytes();
    await flush();
    expect(tasks).toHaveLength(0);
    skin.want();
    await flush();
    expect(tasks).toHaveLength(1);
  });

  it('keeps every strip for a quiet moment: an upload (the room lets an urgent one go between frames)', async () => {
    const { skin, yields, runUnits, bytes } = setup();
    skin.want();
    skin.fetch();
    bytes();
    await flush();
    runUnits();
    expect(yields.length).toBeGreaterThan(2048 / SKIN_STRIP_ROWS);
    expect(yields.every((value) => value === QUIET)).toBe(true);
  });

  it('goes up a 1 MB strip per unit, every row once, the mipmaps with the last, then every material switches', async () => {
    const { skin, copies, allocated, atlas, atlasImage, dispose, materials, bitmap, runUnits, bytes } = setup();
    skin.want();
    skin.fetch();
    bytes();
    await flush();
    const units = runUnits();
    const strips = 2048 / SKIN_STRIP_ROWS;
    // A unit that waits for its moment, the storage, then one unit per strip (the last one also switches).
    expect(units).toBe(2 + strips);
    expect(allocated).toHaveLength(1);
    expect(copies.map((copy) => copy.rows)).toEqual(
      Array.from({ length: strips }, (_, i) => [i * SKIN_STRIP_ROWS, (i + 1) * SKIN_STRIP_ROWS]),
    );
    expect(copies.every((copy) => copy.at === copy.rows[0])).toBe(true);
    expect(copies.map((copy) => copy.mipmaps)).toEqual([...Array(strips - 1).fill(false), true]);
    expect(materials.every((material) => material.map === allocated[0])).toBe(true);
    expect(skin.shown).toBe(true);
    expect(skin.pixels).toBe(2048 * 2048);
    // The 1K atlas's GPU copy goes, its image stays; the decoded 2K image is let go.
    expect(dispose).toHaveBeenCalled();
    expect(atlas.image).toBe(atlasImage);
    expect(atlasImage.close).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('shows nothing half done: until the last strip the materials keep the atlas', async () => {
    const { skin, atlas, materials, runUnits, bytes } = setup();
    skin.want();
    skin.fetch();
    bytes();
    await flush();
    runUnits(5);
    expect(materials.every((material) => material.map === atlas)).toBe(true);
    expect(skin.shown).toBe(false);
  });

  it('stops and lets the image go when the slow tier is decided mid-way', async () => {
    const { skin, tasks, bitmap, runUnits, bytes, atlas, materials } = setup();
    skin.want();
    skin.fetch();
    bytes();
    await flush();
    runUnits(3);
    skin.abandon();
    expect(tasks).toHaveLength(0);
    expect(bitmap.close).toHaveBeenCalled();
    expect(materials.every((material) => material.map === atlas)).toBe(true);
  });

  it('falls back on the atlas when the context is lost, and goes up again', async () => {
    const { skin, atlas, materials, runUnits, bytes, allocated } = setup();
    skin.want();
    skin.fetch();
    bytes();
    await flush();
    runUnits();
    skin.restore();
    expect(materials.every((material) => material.map === atlas)).toBe(true);
    expect(skin.pixels).toBe(0);
    await flush();
    runUnits();
    expect(allocated).toHaveLength(2);
    expect(materials.every((material) => material.map === allocated[1])).toBe(true);
  });

  it('stays the atlas when the bytes or the decode fail', async () => {
    for (const fail of ['fetch', 'decode'] as const) {
      const { skin, tasks, bytes } = setup({ fail });
      skin.want();
      skin.fetch();
      bytes();
      await flush();
      expect(tasks).toHaveLength(0);
      expect(skin.shown).toBe(false);
    }
  });
});
