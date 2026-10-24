import { describe, expect, it } from 'vitest';
import { DEFAULT_MIX } from '@/engine/audio/mix/Mixer';
import { type SfxRecipe, sfxLength, sfxNotes } from '@/engine/audio/sfx/recipe';
import { FOLEY_CUES, FOLEY_LEVELS, type FoleyCue, foleyId, foleyRecipe, RISE_NOTES, SINK_NOTES } from './foley';

/**
 * The recipes as data: valid notes, bounded lengths and levels. They are also rendered
 * offline through the engine's mixer in Chromium (e2e/radio-player.spec.ts), which
 * measures their peaks and tails.
 */
const SPIN = new Set(['spin-up', 'spin-down']);

describe('foley', () => {
  interface Case {
    readonly cue: FoleyCue;
    readonly order: number;
    readonly recipe: SfxRecipe;
  }
  const recipes = FOLEY_CUES.flatMap((cue): Case[] =>
    cue === 'disc-rise' || cue === 'disc-sink'
      ? RISE_NOTES.map((_, order) => ({ cue, order, recipe: foleyRecipe(cue, order) }))
      : [{ cue, order: 0, recipe: foleyRecipe(cue) }],
  );

  it.each(recipes)('$cue #$order is short, valid and has decayed in time', ({ cue, recipe }) => {
    expect(recipe.voices.length).toBeGreaterThan(0);
    expect(sfxLength(recipe)).toBeGreaterThan(0.004);
    expect(sfxLength(recipe)).toBeLessThanOrEqual(SPIN.has(cue) ? 1.5 : 1.2);
    for (const { note } of sfxNotes(recipe, 0)) {
      expect(Number.isFinite(note.midi)).toBe(true);
      expect(note.hold).toBeGreaterThan(0);
    }
  });

  it.each(recipes)('$cue #$order cannot clip: even every voice at once stays under −1 dBFS', ({ recipe }) => {
    const worst =
      (recipe.gain ?? 1) *
      DEFAULT_MIX.sfx *
      DEFAULT_MIX.master *
      recipe.voices.reduce((sum, voice) => sum + (voice.velocity ?? 1), 0);
    expect(20 * Math.log10(worst)).toBeLessThan(-1);
  });

  it('mixes the latch loudest and the flip quietest (their peaks are checked against their levels offline)', () => {
    const gainDb = (cue: FoleyCue): number => 20 * Math.log10(foleyRecipe(cue).gain ?? 1);
    for (const cue of FOLEY_CUES) expect(Number.isFinite(gainDb(cue)), cue).toBe(true);
    expect(FOLEY_LEVELS['lid-latch']).toBeGreaterThan(FOLEY_LEVELS['key-down']);
    expect(Math.min(...Object.values(FOLEY_LEVELS))).toBe(FOLEY_LEVELS['disc-flip']);
  });

  it('rings the rising chord upwards and the sinking one downwards, clamping the stagger', () => {
    const pitch = (cue: 'disc-rise' | 'disc-sink', order: number): number =>
      Math.max(...sfxNotes(foleyRecipe(cue, order), 0).map(({ note }) => note.midi));
    expect(pitch('disc-rise', 1)).toBeGreaterThan(pitch('disc-rise', 0));
    expect(pitch('disc-sink', 1)).toBeLessThan(pitch('disc-sink', 0));
    expect(foleyRecipe('disc-rise', 40)).toBe(foleyRecipe('disc-rise', RISE_NOTES.length - 1));
    expect(SINK_NOTES).toHaveLength(RISE_NOTES.length);
  });

  it('keeps each disc’s bell its own in the limiter, so a stagger is never cut short', () => {
    expect(foleyId('disc-rise', 3)).toBe('disc-rise:3');
    expect(foleyId('key-down', 3)).toBe('key-down');
  });
});
