import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { FRAME } from '../classic/rig';
import { TERRARIA_DESIGNS } from './designs';

/**
 * The designs as tools/looks/terraria/generate.py writes them. Drawing them
 * (size, crisp alpha, height) is covered in the browser by e2e/looks.spec.ts.
 */
describe('the Terraria designs', () => {
  it('give every hero one design, in the select order', () => {
    expect(TERRARIA_DESIGNS.map((design) => design.hero)).toEqual(characters.map((hero) => hero.id));
  });

  it.each(TERRARIA_DESIGNS.map((design) => [design.hero, design] as const))(
    '%s stands still in the classic hero frame, on the feet line',
    (hero, design) => {
      const spec = parseSpriteSheetSpec(design.sheet.json, `${hero}.json`);
      expect(spec.frame).toEqual(FRAME);
      expect(spec.origin).toEqual({ x: FRAME.w / 2, y: FRAME.h });
      expect(spec.animations).toEqual([{ name: 'idle', fps: 1, loop: true, frames: 1, anchors: {} }]);
    },
  );

  it('list every sheet the generator wrote, so none goes unseen', () => {
    const written = readdirSync(resolve(import.meta.dirname, 'designs')).sort();
    expect(written).toEqual(TERRARIA_DESIGNS.flatMap((design) => [`${design.hero}.json`, `${design.hero}.png`]).sort());
  });
});
