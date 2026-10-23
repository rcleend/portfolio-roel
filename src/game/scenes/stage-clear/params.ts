import { type CharacterId, characters, type LevelId, levels } from '@/content';
import type { LevelResult, StageClearParams } from '../params';

/**
 * Stage-clear params arrive typed from the level, but also as hand-written
 * JSON from the dev harness (`?scene=stageClear&params=…`). Normalising them
 * keeps a half-written URL from crashing the screen: unknown ids fall back to
 * the first mission and character, missing numbers to zero.
 */
export function normalizeStageClearParams(raw: unknown): StageClearParams {
  const record = isRecord(raw) ? raw : {};
  const levelId = levels.find((level) => level.id === record.levelId)?.id ?? (levels[0]?.id as LevelId);
  const characterId =
    characters.find((character) => character.id === record.characterId)?.id ?? (characters[0]?.id as CharacterId);
  const result = isRecord(record.result) ? record.result : {};
  const normalized: LevelResult = {
    score: count(result.score),
    customersWon: count(result.customersWon),
    timeSeconds: count(result.timeSeconds),
    highlights: Array.isArray(result.highlights)
      ? result.highlights.filter((id): id is string => typeof id === 'string')
      : [],
  };
  return { levelId, characterId, result: normalized };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
