import { describe, expect, it } from 'vitest';
import { sfxLength, sfxNotes } from '@/engine/audio/sfx/recipe';
import { SFX_IDS } from '../ids';
import { sfx } from '.';

describe('sound effects', () => {
  it.each(SFX_IDS)('%s is short, bounded and valid', (id) => {
    const recipe = sfx[id];
    expect(recipe.voices.length).toBeGreaterThan(0);
    expect(sfxLength(recipe)).toBeGreaterThan(0.01);
    expect(sfxLength(recipe)).toBeLessThanOrEqual(1.5);
    // Parsing every note proves the recipe's names are real pitches.
    for (const { note } of sfxNotes(recipe, 0)) {
      expect(Number.isFinite(note.midi)).toBe(true);
      expect(note.hold).toBeGreaterThan(0);
    }
  });

  it('keeps rapid-fire effects cheap: short, rate-limited and capped', () => {
    for (const id of ['typewriter', 'menu-move', 'hit', 'land'] as const) {
      expect(sfxLength(sfx[id])).toBeLessThan(0.2);
      expect(sfx[id].cooldown ?? 0.03).toBeGreaterThan(0);
      expect(sfx[id].maxInstances ?? 3).toBeLessThanOrEqual(3);
    }
  });
});
