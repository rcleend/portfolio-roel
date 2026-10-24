import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import { REVISED_TERRARIA_DESIGNS, TERRARIA_DESIGNS } from '../../art/looks/terraria/designs';
import { standsFor, standX } from './cast';

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

  it('spreads the stands evenly across the screen', () => {
    expect([0, 1, 2, 3, 4].map((index) => standX(index, 5, 320))).toEqual([32, 96, 160, 224, 288]);
    expect([0, 1, 2].map((index) => standX(index, 3, 320))).toEqual([53, 160, 267]);
  });
});
