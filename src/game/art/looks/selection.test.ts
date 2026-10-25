import { describe, expect, it } from 'vitest';
import { characters, type SkillId, skills } from '@/content';
import type { LookId } from './ids';
import { lookRegistry } from './registry';
import { DEFAULT_LOOKS, type LookOffer, LookSelectionError, parseLookSelection, resolveLooks } from './selection';

const skillIds = Object.keys(skills) as SkillId[];

/** The shipped looks and classic everywhere, plus a few pieces in other looks — the shape a half-finished set has. */
const offer: LookOffer = {
  characters: {
    hackerman: ['classic', 'arcade', 'terraria-revised'],
    artsy: ['classic', 'terraria-revised'],
    strategy: ['classic', 'hibit', 'terraria-revised'],
  },
  customer: ['classic', 'portrait', 'terraria'],
  skills: {
    'full-stack-attack': ['classic'],
    'agent-summon': ['classic'],
    'ux-elixir': ['classic'],
    'power-chord': ['classic', 'arcade'],
    'north-star': ['classic'],
    'churn-shield': ['classic'],
  },
};

describe('DEFAULT_LOOKS', () => {
  it('draws every hero in the revised Terraria look, the customer in Terraria and every skill in classic', () => {
    expect(Object.keys(DEFAULT_LOOKS.characters).sort()).toEqual(characters.map((c) => c.id).sort());
    expect(Object.keys(DEFAULT_LOOKS.skills).sort()).toEqual([...skillIds].sort());
    expect(new Set<LookId>(Object.values(DEFAULT_LOOKS.characters))).toEqual(new Set(['terraria-revised']));
    expect(DEFAULT_LOOKS.customer).toBe('terraria');
    expect(new Set<LookId>(Object.values(DEFAULT_LOOKS.skills))).toEqual(new Set(['classic']));
  });

  it('names only pieces the registered looks draw', () => {
    expect(resolveLooks({}, lookRegistry.offer)).toEqual(DEFAULT_LOOKS);
  });
});

describe('parseLookSelection', () => {
  it('reads a partial selection from JSON', () => {
    expect(
      parseLookSelection({
        characters: { hackerman: 'arcade' },
        customer: 'hibit',
        skills: { 'power-chord': 'portrait' },
      }),
    ).toEqual({ characters: { hackerman: 'arcade' }, customer: 'hibit', skills: { 'power-chord': 'portrait' } });
    expect(parseLookSelection({})).toEqual({});
  });

  it.each([
    [3, 'looks must be an object like {"characters":{"hackerman":"arcade"}}, got 3'],
    [{ heroes: {} }, 'looks: unknown key "heroes" (expected characters, customer, skills)'],
    [
      { characters: { hackermann: 'arcade' } },
      'looks.characters: unknown id "hackermann" (expected hackerman, artsy, strategy)',
    ],
    [
      { skills: { 'power-chord': 'neon' } },
      'looks.skills.power-chord must be one of classic, arcade, portrait, hibit, terraria, terraria-revised, terraria-hooded, got "neon"',
    ],
    [
      { customer: 7 },
      'looks.customer must be one of classic, arcade, portrait, hibit, terraria, terraria-revised, terraria-hooded, got 7',
    ],
    [{ characters: ['arcade'] }, 'looks.characters must map ids to looks, like {"hackerman":"arcade"}, got ["arcade"]'],
  ])('rejects %j with a clear message', (raw, message) => {
    expect(() => parseLookSelection(raw)).toThrow(new LookSelectionError(message));
  });
});

describe('resolveLooks', () => {
  it('fills everything left out from the defaults', () => {
    expect(resolveLooks({}, offer)).toEqual(DEFAULT_LOOKS);
  });

  it('overrides only the pieces asked for', () => {
    const selection = resolveLooks({ characters: { strategy: 'hibit' }, skills: { 'power-chord': 'arcade' } }, offer);
    expect(selection.characters).toEqual({
      hackerman: 'terraria-revised',
      artsy: 'terraria-revised',
      strategy: 'hibit',
    });
    expect(selection.customer).toBe('terraria');
    expect(selection.skills['power-chord']).toBe('arcade');
    expect(selection.skills['north-star']).toBe('classic');
  });

  it('refuses a piece a look has not drawn, naming the looks that have', () => {
    expect(() => resolveLooks({ characters: { artsy: 'arcade' } }, offer)).toThrow(
      'looks.characters.artsy: the "arcade" look has not drawn this yet (available: classic, terraria-revised)',
    );
    expect(() => resolveLooks({ customer: 'hibit' }, offer)).toThrow(
      'looks.customer: the "hibit" look has not drawn this yet (available: classic, portrait, terraria)',
    );
  });
});
