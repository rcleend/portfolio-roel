import { type CharacterId, characters } from '@/content';
import { REVISED_TERRARIA_DESIGNS, TERRARIA_DESIGNS, type TerrariaDesign } from '../../art/looks/terraria/designs';
import type { Lineup } from './params';

/** One figure in the lineup. */
export interface Stand {
  readonly hero: CharacterId;
  /** The design worn, or `null` for the hero as the game draws them. */
  readonly design: TerrariaDesign | null;
  /** Stands beside the designs to show the size they must fit, rather than as one of the cast. */
  readonly scale: boolean;
}

/** The hero whose game sprite stands beside the designs: the one the showcase plays by default. */
const SCALE_HERO: CharacterId = 'hackerman';

/** Who stands in line, left to right. */
export function standsFor(cast: Lineup['cast']): readonly Stand[] {
  if (cast === 'game') return characters.map((hero) => ({ hero: hero.id, design: null, scale: false }));
  const designs = cast === 'revised' ? REVISED_TERRARIA_DESIGNS : TERRARIA_DESIGNS;
  return [
    { hero: SCALE_HERO, design: null, scale: true },
    ...designs.map((design) => ({ hero: design.hero, design, scale: false })),
  ];
}

/** The centre of stand `index` of `count`, spread evenly across `width`. */
export function standX(index: number, count: number, width: number): number {
  return Math.round(((index + 0.5) * width) / count);
}
