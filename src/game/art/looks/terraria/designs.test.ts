import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import { lookRegistry } from '../registry';
import { TERRARIA_DESIGNS } from './designs';

/**
 * The lineup's designs are the Terraria look itself, so what the lineup shows
 * is what the look plays. Drawing them (crisp alpha, no taller than the
 * classic heroes) is covered in the browser by e2e/looks.spec.ts.
 */
describe('the Terraria designs', () => {
  it('give every hero one design, in the select order', () => {
    expect(TERRARIA_DESIGNS.map((design) => design.hero)).toEqual(characters.map((hero) => hero.id));
  });

  it.each(TERRARIA_DESIGNS.map((design) => [design.hero, design] as const))(
    '%s is the sheet the Terraria look registers',
    async (hero, design) => {
      const look = await lookRegistry.hero('terraria', hero);
      expect(design.sheet).toEqual(look.sheet);
    },
  );
});
