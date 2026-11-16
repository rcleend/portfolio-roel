import type { AssetStore } from '@/engine/assets/AssetStore';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import type { CustomerAnimation } from '../../contracts';
import type { ImageSheetSource } from '../../module';
import { art as onThePhoneArt } from './on-the-phone.art';
import onThePhoneJson from './on-the-phone.json';
import { art as oneStarArt } from './one-star.art';
import oneStarJson from './one-star.json';
import { art as theReceiptArt } from './the-receipt.art';
import theReceiptJson from './the-receipt.json';

/** The two ends of a customer each concept is drawn in, named after the customer animations they will open. */
export const CONCEPT_POSES = ['shout', 'happy'] as const satisfies readonly CustomerAnimation[];
export type ConceptPose = (typeof CONCEPT_POSES)[number];

/**
 * A concept for the Unhappy Customer in the Terraria style, drawn by
 * tools/looks/terraria/customer/generate.py: one still frame of each key
 * pose, in the customer's 64 × 64 frame on the feet line. The concepts are
 * not a look (docs/LOOKS.md): nothing registers them, and only the
 * development lineup shows them, until the captain picks the one to animate.
 */
export interface CustomerConcept {
  readonly id: 'on-the-phone' | 'the-receipt' | 'one-star';
  /** A short display name, e.g. "One star". */
  readonly name: string;
  readonly description: string;
  readonly sheet: ImageSheetSource;
}

export type CustomerConceptId = CustomerConcept['id'];

/** Every concept, in the generator's order. */
export const CUSTOMER_CONCEPTS: readonly CustomerConcept[] = [
  {
    id: 'on-the-phone',
    name: 'On the phone',
    description:
      'A middle manager, red to the scalp, yelling into the brick phone at his ear and jabbing a finger at you; won over, a thumbs up.',
    sheet: { art: onThePhoneArt, json: onThePhoneJson },
  },
  {
    id: 'the-receipt',
    name: 'The receipt',
    description: 'A shopper fuming steam, holding up a receipt as long as she is; won over, it goes in the bag.',
    sheet: { art: theReceiptArt, json: theReceiptJson },
  },
  {
    id: 'one-star',
    name: 'One star',
    description: 'An app user brandishing a cracked tablet rating you 1 star; won over, it shows five stars.',
    sheet: { art: oneStarArt, json: oneStarJson },
  },
];

const imageKey = (concept: CustomerConcept): string => `looks/terraria/customer-concepts/${concept.id}`;

/**
 * Decodes every concept into `assets`. The game never does: whoever opens
 * a scene that draws them (the harness) calls this first, so the scene can
 * read them synchronously.
 */
export async function loadCustomerConcepts(assets: AssetStore): Promise<void> {
  for (const concept of CUSTOMER_CONCEPTS) assets.addImage(imageKey(concept), concept.sheet.art);
}

/** The concept's sheet, from the image `loadCustomerConcepts` decoded; the store throws if it never ran. */
export function customerConceptSheet(assets: AssetStore, concept: CustomerConcept): SpriteSheet<ConceptPose> {
  const key = imageKey(concept);
  const sheet = SpriteSheet.fromImage(assets.image(key), parseSpriteSheetSpec(concept.sheet.json, `${key}.json`), key);
  if (!sheet.hasAll(CONCEPT_POSES)) throw new Error(`${key} must draw ${CONCEPT_POSES.join(' and ')}`);
  return sheet;
}
