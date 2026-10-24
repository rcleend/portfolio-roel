import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import { lookRegistry } from '../registry';
import { REVISED_TERRARIA_DESIGNS, TERRARIA_DESIGNS } from './designs';

const heroes = characters.map((hero) => hero.id);

/**
 * The lineup's designs are the Terraria look itself, so what the lineup shows
 * is what the look plays, and its revision beside them, which the look does
 * not play. Drawing them (crisp alpha, no taller than the classic heroes) is
 * covered in the browser by e2e/looks.spec.ts; tools/looks/terraria checks
 * their pixels.
 */
describe('the Terraria designs', () => {
  it('give every hero one design, in the select order', () => {
    expect(TERRARIA_DESIGNS.map((design) => design.hero)).toEqual(heroes);
    expect(TERRARIA_DESIGNS.map((design) => design.variant)).toEqual(heroes.map(() => null));
  });

  it.each(TERRARIA_DESIGNS.map((design) => [design.hero, design] as const))(
    '%s is the sheet the Terraria look registers',
    async (hero, design) => {
      const look = await lookRegistry.hero('terraria', hero);
      expect(design.sheet).toEqual(look.sheet);
    },
  );
});

describe('the revised Terraria designs', () => {
  it('give every hero a revised design in the select order, then the ENGINEER with his hood up', () => {
    expect(REVISED_TERRARIA_DESIGNS.map((design) => [design.hero, design.variant])).toEqual([
      ...heroes.map((hero) => [hero, null]),
      ['hackerman', 'HOOD UP'],
    ]);
  });

  it('are sheets of their own beside the look, each found by a different id', async () => {
    const all = [...TERRARIA_DESIGNS, ...REVISED_TERRARIA_DESIGNS];
    expect(new Set(all.map((design) => design.id)).size).toBe(all.length);
    for (const design of REVISED_TERRARIA_DESIGNS) {
      const look = await lookRegistry.hero('terraria', design.hero);
      expect(design.sheet, design.id).not.toEqual(look.sheet);
    }
  });
});
