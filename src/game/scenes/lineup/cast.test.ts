import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import { CUSTOMER_CONCEPTS } from '../../art/looks/terraria/customer-concepts/concepts';
import { REVISED_TERRARIA_DESIGNS, TERRARIA_DESIGNS } from '../../art/looks/terraria/designs';
import { customerStandsFor, customersScaleHero, standsFor, standX } from './cast';

describe('the lineup cast', () => {
  it('stands every Terraria design beside one hero as the game draws them, for scale', () => {
    const [scale, ...designs] = standsFor('terraria');
    expect(scale).toEqual({ hero: 'hackerman', design: null, scale: true });
    expect(designs.map((stand) => stand.design)).toEqual(TERRARIA_DESIGNS);
    expect(designs.map((stand) => stand.hero)).toEqual(TERRARIA_DESIGNS.map((design) => design.hero));
  });

  it('stands the revised designs, the hooded ENGINEER last, beside the same hero for scale', () => {
    const [scale, ...designs] = standsFor('revised');
    expect(scale).toEqual({ hero: 'hackerman', design: null, scale: true });
    expect(designs.map((stand) => stand.design)).toEqual(REVISED_TERRARIA_DESIGNS);
    expect(designs.map((stand) => stand.hero)).toEqual(REVISED_TERRARIA_DESIGNS.map((design) => design.hero));
  });

  it('stands every hero as the game draws them, in the select order', () => {
    expect(standsFor('game')).toEqual(characters.map((hero) => ({ hero: hero.id, design: null, scale: false })));
  });

  it('stands the customers beside the Terraria ENGINEER, so they are seen at the size of the heroes', () => {
    expect(customersScaleHero().hero).toBe('hackerman');
    expect(TERRARIA_DESIGNS).toContain(customersScaleHero());
  });

  it("stands the game's customer shouting, then won over, each facing right and then left", () => {
    expect(customerStandsFor('game')).toEqual([
      { concept: null, pose: 'shout', facing: 'right', scale: false },
      { concept: null, pose: 'shout', facing: 'left', scale: false },
      { concept: null, pose: 'happy', facing: 'right', scale: false },
      { concept: null, pose: 'happy', facing: 'left', scale: false },
    ]);
  });

  it.each(CUSTOMER_CONCEPTS.map((concept) => [concept.id, concept] as const))(
    "stands the %s concept shouting and won over, both ways, after the game's shouting customer, for scale",
    (id, concept) => {
      expect(customerStandsFor(id)).toEqual([
        { concept: null, pose: 'shout', facing: 'right', scale: true },
        { concept, pose: 'shout', facing: 'right', scale: false },
        { concept, pose: 'shout', facing: 'left', scale: false },
        { concept, pose: 'happy', facing: 'right', scale: false },
        { concept, pose: 'happy', facing: 'left', scale: false },
      ]);
    },
  );

  it('spreads the stands evenly across the screen', () => {
    expect([0, 1, 2, 3, 4].map((index) => standX(index, 5, 320))).toEqual([32, 96, 160, 224, 288]);
    expect([0, 1, 2].map((index) => standX(index, 3, 320))).toEqual([53, 160, 267]);
  });
});
