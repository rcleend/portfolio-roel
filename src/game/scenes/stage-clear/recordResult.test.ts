import { describe, expect, it } from 'vitest';
import { defaultSession, type SessionState } from '../../session';
import type { LevelResult } from '../params';
import { isNewBest, recordLevelResult } from './recordResult';

const result = (overrides: Partial<LevelResult> = {}): LevelResult => ({
  score: 1200,
  highlights: ['luna-agent'],
  customersWon: 8,
  timeSeconds: 75,
  ...overrides,
});

describe('recordLevelResult', () => {
  it('marks the level completed once and stores highlights and score', () => {
    const next = recordLevelResult(defaultSession(), 'luna', result());
    expect(next.completed).toEqual(['luna']);
    expect(next.highlights.luna).toEqual(['luna-agent']);
    expect(next.bestScore.luna).toBe(1200);
    expect(recordLevelResult(next, 'luna', result()).completed).toEqual(['luna']);
  });

  it('accumulates highlights across replays instead of replacing them', () => {
    const first = recordLevelResult(defaultSession(), 'luna', result({ highlights: ['luna-agent', 'luna-exit'] }));
    const replay = recordLevelResult(first, 'luna', result({ highlights: ['luna-outbound', 'luna-agent'] }));
    expect(replay.highlights.luna).toEqual(['luna-agent', 'luna-exit', 'luna-outbound']);
  });

  it('keeps the best score and never lowers it', () => {
    const high = recordLevelResult(defaultSession(), 'scripe', result({ score: 5000 }));
    expect(recordLevelResult(high, 'scripe', result({ score: 300 })).bestScore.scripe).toBe(5000);
    expect(recordLevelResult(high, 'scripe', result({ score: 9000 })).bestScore.scripe).toBe(9000);
  });

  it('leaves other levels and unrelated fields untouched', () => {
    const before: SessionState = {
      ...defaultSession(),
      characterId: 'artsy',
      completed: ['luna'],
      highlights: { luna: ['luna-exit'] },
      bestScore: { luna: 10 },
    };
    const next = recordLevelResult(before, 'scripe', result({ highlights: ['scripe-ios'] }));
    expect(next).toMatchObject({
      characterId: 'artsy',
      completed: ['luna', 'scripe'],
      highlights: { luna: ['luna-exit'], scripe: ['scripe-ios'] },
      bestScore: { luna: 10 },
    });
  });

  it('sanitises a fractional or negative score', () => {
    expect(recordLevelResult(defaultSession(), 'luna', result({ score: 99.7 })).bestScore.luna).toBe(99);
    expect(recordLevelResult(defaultSession(), 'luna', result({ score: -5 })).bestScore.luna).toBe(0);
  });
});

describe('isNewBest', () => {
  it('celebrates the first clear and strictly better runs only', () => {
    const before = recordLevelResult(defaultSession(), 'luna', result({ score: 1000 }));
    expect(isNewBest(defaultSession(), 'luna', 0)).toBe(true);
    expect(isNewBest(before, 'luna', 1000)).toBe(false);
    expect(isNewBest(before, 'luna', 1001)).toBe(true);
  });
});
