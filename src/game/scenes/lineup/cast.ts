import { type CharacterId, characters } from '@/content';
import {
  CONCEPT_POSES,
  type ConceptPose,
  CUSTOMER_CONCEPTS,
  type CustomerConcept,
} from '../../art/looks/terraria/customer-concepts/concepts';
import { REVISED_TERRARIA_DESIGNS, TERRARIA_DESIGNS, type TerrariaDesign } from '../../art/looks/terraria/designs';
import type { Lineup, LineupCustomer } from './params';

/** One figure in the lineup. */
export interface Stand {
  readonly hero: CharacterId;
  /** The design worn, or `null` for the hero as the game draws them. */
  readonly design: TerrariaDesign | null;
  /** Stands beside the designs to show the size they must fit, rather than as one of the cast. */
  readonly scale: boolean;
}

/** Which way a figure faces: sheets draw it facing right, and the game mirrors it to face left. */
export type Facing = 'right' | 'left';

/** One customer in the customers cast. */
export interface CustomerStand {
  /** The concept drawn, or `null` for the customer as the game draws it. */
  readonly concept: CustomerConcept | null;
  readonly pose: ConceptPose;
  readonly facing: Facing;
  /** Stands beside the concept to show the size it must fit, rather than as one of the cast. */
  readonly scale: boolean;
}

/**
 * A customer faces the player, so in play it is mirrored about as often as
 * not: walking at a hero on its left, and still facing them once won over.
 * Each mood stands both ways, so whatever a sheet draws (a screen, a sign)
 * is seen the way the game will show it.
 */
const FACINGS: readonly Facing[] = ['right', 'left'];

/** The hero whose game sprite stands beside the designs: the one the showcase plays by default. */
const SCALE_HERO: CharacterId = 'hackerman';

/**
 * What a scale stand is labelled: its part in the lineup, the figure as the
 * game draws it. Not the look it wears, which is whatever the game picks: an
 * id such as TERRARIA-REVISED is wider than the five stands of a cast leave it.
 */
export const SCALE_LABEL = 'IN GAME';

/** Who stands in line, left to right. */
export function standsFor(cast: Exclude<Lineup['cast'], 'customers'>): readonly Stand[] {
  if (cast === 'game') return characters.map((hero) => ({ hero: hero.id, design: null, scale: false }));
  const designs = cast === 'revised' ? REVISED_TERRARIA_DESIGNS : TERRARIA_DESIGNS;
  return [
    { hero: SCALE_HERO, design: null, scale: true },
    ...designs.map((design) => ({ hero: design.hero, design, scale: false })),
  ];
}

/** The Terraria hero who stands first in the customers cast, so a concept is seen at the size of the heroes. */
export function customersScaleHero(): TerrariaDesign {
  const design = TERRARIA_DESIGNS.find((candidate) => candidate.hero === SCALE_HERO);
  if (!design) throw new Error(`lineup: the Terraria look has no ${SCALE_HERO}`);
  return design;
}

/**
 * The customers who stand after that hero, left to right: the customer
 * shouting and then won over, each facing right and then left, a concept
 * after the game's shouting customer it would replace.
 */
export function customerStandsFor(customer: LineupCustomer): readonly CustomerStand[] {
  const concept = CUSTOMER_CONCEPTS.find((candidate) => candidate.id === customer) ?? null;
  const moods = CONCEPT_POSES.flatMap((pose) =>
    FACINGS.map((facing): CustomerStand => ({ concept, pose, facing, scale: false })),
  );
  return concept ? [{ concept: null, pose: 'shout', facing: 'right', scale: true }, ...moods] : moods;
}

/** The centre of stand `index` of `count`, spread evenly across `width`. */
export function standX(index: number, count: number, width: number): number {
  return Math.round(((index + 0.5) * width) / count);
}
