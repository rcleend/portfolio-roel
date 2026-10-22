import type { LevelId } from '@/content';
import { parseLayout } from '../../world/map/layout';
import type { StageDefinition } from '../../world/stage';
import { STAGES } from '../level/stages';

/** One screen of 16 px columns, so the camera never moves. */
const ARENA_COLUMNS = 20;
/** Where the hero starts, in columns. */
const HERO_COLUMN = 3;

/**
 * A flat, one-screen stretch of a real stage for the showcase: the stage's
 * theme and art, the hero on the left, customers where the demo wants them.
 * The goal, the boss and the arena wall sit in the last column, out of the
 * hero's reach, where they never come into play.
 */
export function arenaStage(levelId: LevelId, customerColumns: readonly number[]): StageDefinition {
  const blank = () => Array.from({ length: ARENA_COLUMNS }, () => '.');
  const rows = Array.from({ length: 9 }, blank);
  const last = ARENA_COLUMNS - 1;
  const [goalRow, bossRow, arenaRow, groundRow] = [rows[5], rows[6], rows[7], rows[8]];
  if (!goalRow || !bossRow || !arenaRow || !groundRow) throw new Error('unreachable: the arena has nine rows');
  goalRow[last] = 'G';
  bossRow[last] = 'E';
  arenaRow[last] = '>';
  groundRow[HERO_COLUMN] = 'P';
  for (const column of customerColumns) groundRow[column] = 'c';
  const section = [...rows.map((row) => row.join('')), '='.repeat(ARENA_COLUMNS)].join('\n');
  return { levelId, layout: parseLayout([section]), theme: STAGES[levelId].theme };
}
