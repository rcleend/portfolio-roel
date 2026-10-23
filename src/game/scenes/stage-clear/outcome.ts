import type { LevelId } from '@/content';
import type { SessionState } from '../../session';
import { allMissionsCleared, nextLevel } from '../level-select/missions';

/** What the player can do once the tally is done. */
export type ClearAction = 'next' | 'finale' | 'missionSelect';

export const CLEAR_ACTION_LABELS: Readonly<Record<ClearAction, string>> = {
  next: 'NEXT MISSION',
  finale: 'CONTINUE',
  missionSelect: 'MISSION SELECT',
};

/**
 * The options under the tally, primary first. With every mission cleared the
 * story continues to the finale (MISSION 3 — YOUR TEAM?) instead of another
 * stage; otherwise the next stage in career order, when there is one.
 */
export function clearActions(session: SessionState, levelId: LevelId): ClearAction[] {
  if (allMissionsCleared(session)) return ['finale', 'missionSelect'];
  return nextLevel(levelId) ? ['next', 'missionSelect'] : ['missionSelect'];
}
