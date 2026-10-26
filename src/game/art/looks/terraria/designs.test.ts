import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import { lookRegistry } from '../registry';
import { REVISED_TERRARIA_DESIGNS, TERRARIA_DESIGNS } from './designs';

const heroes = characters.map((hero) => hero.id);

/**
 * The lineup's designs are the Terraria looks themselves, so what the lineup
 * shows is what each look plays: the Terraria look, and its revision beside
 * it. Drawing them (crisp alpha, no taller than the classic heroes) is
 * covered in the browser by e2e/looks.spec.ts; tools/looks/terraria checks
 * their pixels.
 */
describe('the Terraria designs', () => {
  it('give every hero one design, in the select order', () => {
    expect(TERRARIA_DESIGNS.map((design) => [design.look, design.hero, design.variant])).toEqual(
      heroes.map((hero) => ['terraria', hero, null]),
    );
  });

  it('give every hero a revised design in the select order, then the ENGINEER with his hood up', () => {
    expect(REVISED_TERRARIA_DESIGNS.map((design) => [design.look, design.hero, design.variant])).toEqual([
      ...heroes.map((hero) => ['terraria-revised', hero, null]),
      ['terraria-hooded', 'hackerman', 'HOOD UP'],
    ]);
  });

  it.each(
    [...TERRARIA_DESIGNS, ...REVISED_TERRARIA_DESIGNS].map((design) => [design.look, design.hero, design] as const),
  )('%s %s is the sheet its look registers', async (look, hero, design) => {
    const registered = await lookRegistry.hero(look, hero);
    expect(design.sheet).toEqual(registered.sheet);
  });

  it('are sheets of their own, so the revision never shows the look it revises', async () => {
    for (const design of REVISED_TERRARIA_DESIGNS) {
      const look = await lookRegistry.hero('terraria', design.hero);
      expect(design.sheet, `${design.look}/${design.hero}`).not.toEqual(look.sheet);
    }
  });
});
