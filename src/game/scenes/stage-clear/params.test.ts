import { describe, expect, it } from 'vitest';
import { normalizeStageClearParams } from './params';

describe('normalizeStageClearParams', () => {
  it('passes well-formed params through', () => {
    const params = {
      levelId: 'scripe',
      characterId: 'artsy',
      result: { score: 4200, customersWon: 9, timeSeconds: 81.5, highlights: ['scripe-ios'] },
    } as const;
    expect(normalizeStageClearParams(params)).toEqual(params);
  });

  it('fills in a half-written harness URL instead of crashing', () => {
    expect(
      normalizeStageClearParams({ levelId: 'mars', result: { score: 'lots', highlights: [1, 'luna-exit'] } }),
    ).toEqual({
      levelId: 'luna',
      characterId: 'hackerman',
      result: { score: 0, customersWon: 0, timeSeconds: 0, highlights: ['luna-exit'] },
    });
    expect(normalizeStageClearParams(undefined).result.highlights).toEqual([]);
  });
});
