import type { LevelId } from '@/content';
import { lunaLayout } from '../../levels/luna/map';
import { lunaTheme } from '../../levels/luna/theme';
import { scripeLayout } from '../../levels/scripe/map';
import { scripeTheme } from '../../levels/scripe/theme';
import type { StageDefinition } from '../../world/stage';

/** Every playable stage by level id. */
export const STAGES: Readonly<Record<LevelId, StageDefinition>> = {
  luna: { levelId: 'luna', layout: lunaLayout, theme: lunaTheme },
  scripe: { levelId: 'scripe', layout: scripeLayout, theme: scripeTheme },
};
