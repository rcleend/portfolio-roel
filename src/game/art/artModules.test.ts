import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePixelData } from '@/engine/gfx/PixelData';
import digests from './art-digests.json';

/**
 * The game's drawn art lives in code: every picture is an `*.art.ts` module `pnpm build:art` wrote from a PNG
 * (docs/ARCHITECTURE.md › Art in code). The build recorded the SHA-256 of each PNG's size and RGBA as its PNG decoder
 * read them; here every module, decoded by the game's own decoder, must give those very bytes, so a module edited by
 * hand or a decoder that drifts cannot change a pixel unnoticed. `pnpm build:art --against <rev>` compares with the
 * PNGs themselves, as git still has them.
 */
const GAME = resolve(import.meta.dirname, '..');
const ROOT = resolve(GAME, '../..');
const modules = import.meta.glob<string>('../**/*.art.ts', { import: 'art' });
const names = Object.keys(modules)
  .map((path) => relative(ROOT, resolve(import.meta.dirname, path)).replace(/\.art\.ts$/, ''))
  .sort();

describe('art modules', () => {
  it('are the pictures the digests were taken of, no more and no fewer', () => {
    expect(names).toEqual(Object.keys(digests).sort());
    expect(names.length).toBeGreaterThan(100);
  });

  it('leave no PNG under src/game: `pnpm build:art` turns one into its module', () => {
    const pngs = readdirSync(GAME, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.png'));
    expect(pngs).toEqual([]);
  });

  it.each(Object.entries(modules).map(([path, load]) => [path.replace(/^\.\.\//, ''), path, load] as const))(
    '%s decodes to the pixels of its PNG',
    async (_name, path, load) => {
      const { width, height, rgba } = decodePixelData(await load());
      const name = relative(ROOT, resolve(import.meta.dirname, path)).replace(/\.art\.ts$/, '');
      const digest = createHash('sha256').update(`${width}x${height}:`).update(rgba).digest('hex');
      expect(digest).toBe((digests as Record<string, string>)[name]);
    },
  );
});
