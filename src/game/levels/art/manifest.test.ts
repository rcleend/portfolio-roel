import { describe, expect, it } from 'vitest';
import { levels } from '@/content';
import { bundledManifests } from './LevelArt';
import { parseLevelArtManifest } from './manifest';

describe('level art manifests', () => {
  const manifests = bundledManifests();

  it('ships art for every playable level', () => {
    expect([...manifests.keys()].sort()).toEqual(levels.map((level) => level.id).sort());
  });

  it.each([...manifests.values()])(
    '$levelId has a sky, a tileset with ground tiles and the highlight block',
    (manifest) => {
      expect(manifest.layers[0]?.opaque).toBe(true);
      for (const tile of ['ground_top', 'ground_fill', 'platform_mid', 'block_highlight', 'block_used']) {
        expect(manifest.tileset.tiles[tile], tile).toBeDefined();
      }
    },
  );

  it('rejects malformed manifests with the offending field', () => {
    expect(() => parseLevelArtManifest({ levelId: 'luna', layers: [{ id: 'sky' }] }, 'test.json')).toThrow(
      /test\.json: layers\[0\]\.file/,
    );
  });
});
