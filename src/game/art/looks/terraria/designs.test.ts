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
  it('give every hero a design, under ids used once', () => {
    expect(new Set(TERRARIA_DESIGNS.map((design) => design.hero))).toEqual(new Set(characters.map((hero) => hero.id)));
    expect(new Set(TERRARIA_DESIGNS.map((design) => design.id)).size).toBe(TERRARIA_DESIGNS.length);
  });

  it('tell apart the designs of a hero who has several by their variant', () => {
    for (const hero of characters) {
      const designs = TERRARIA_DESIGNS.filter((design) => design.hero === hero.id);
      const variants = designs.map((design) => design.variant);
      if (designs.length === 1) expect(variants).toEqual([null]);
      else expect(new Set(variants).size, hero.id).toBe(designs.length);
    }
  });

  it.each(TERRARIA_DESIGNS.map((design) => [design.id, design] as const))(
    '%s stands still in the classic hero frame, on the feet line',
    (id, design) => {
      const spec = parseSpriteSheetSpec(design.sheet.json, `${id}.json`);
      expect(spec.frame).toEqual(FRAME);
      expect(spec.origin).toEqual({ x: FRAME.w / 2, y: FRAME.h });
      expect(spec.animations).toEqual([{ name: 'idle', fps: 1, loop: true, frames: 1, anchors: {} }]);
    },
  );

  it('list every sheet the generator wrote, so none goes unseen', () => {
    const written = readdirSync(resolve(import.meta.dirname, 'designs')).sort();
    expect(written).toEqual(TERRARIA_DESIGNS.flatMap((design) => [`${design.id}.json`, `${design.id}.png`]).sort());
  });
});
