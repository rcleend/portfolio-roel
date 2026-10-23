import type { LevelId } from '@/content';
import type { SessionState } from '../../session';
import type { LevelResult } from '../params';

/**
 * Folds one finished run into the session. The stage-clear screen is the
 * single writer of level results, so this is the only place that decides how
 * replays combine: completion sticks, highlights accumulate across runs (a
 * replay can only reveal more of the career, never hide it) and the best
 * score is kept.
 */
export function recordLevelResult(state: SessionState, levelId: LevelId, result: LevelResult): SessionState {
  const highlights = [...new Set([...(state.highlights[levelId] ?? []), ...result.highlights])];
  const score = Math.max(0, Math.floor(result.score));
  return {
    ...state,
    completed: state.completed.includes(levelId) ? state.completed : [...state.completed, levelId],
    highlights: { ...state.highlights, [levelId]: highlights },
    bestScore: { ...state.bestScore, [levelId]: Math.max(state.bestScore[levelId] ?? 0, score) },
  };
}

/** A record worth celebrating: strictly better than every earlier run (the first clear always counts). */
export function isNewBest(before: SessionState, levelId: LevelId, score: number): boolean {
  const previous = before.bestScore[levelId];
  return previous === undefined || score > previous;
}
