import { describe, expect, it } from 'vitest';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { CUSTOMER_SHEET } from '../../contracts';
import { CONCEPT_POSES, CUSTOMER_CONCEPTS } from './concepts';

/**
 * The concepts are drawn by tools/looks/terraria/customer/generate.py, whose
 * own tests hold the art to the Terraria heroes; drawing them crisply in the
 * browser is covered by e2e/looks.spec.ts.
 */
describe('the Terraria customer concepts', () => {
  it('are the three the generator draws, each once', () => {
    expect(CUSTOMER_CONCEPTS.map((concept) => concept.id)).toEqual(['on-the-phone', 'the-receipt', 'one-star']);
  });

  it.each(CUSTOMER_CONCEPTS.map((concept) => [concept.id, concept] as const))(
    '%s stands in the customer frame, shouting and won over, marking its mouth and head',
    (id, concept) => {
      const spec = parseSpriteSheetSpec(concept.sheet.json, id);
      expect(spec.frame).toEqual(CUSTOMER_SHEET.frame);
      expect(spec.origin).toEqual(CUSTOMER_SHEET.origin);
      expect(spec.animations.map((animation) => animation.name)).toEqual(CONCEPT_POSES);
      for (const animation of spec.animations) expect(Object.keys(animation.anchors).sort()).toEqual(['head', 'mouth']);
    },
  );
});
