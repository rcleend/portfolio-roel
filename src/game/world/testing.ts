import { type CharacterId, getExperience, getLevel, type LevelId } from '@/content';
import { Rng } from '@/engine/math/Rng';
import { STAGES } from '../scenes/level/stages';
import { World } from './World';

/** Prop frame sizes from the levels' layers.json, so tests need no images. */
export const TEST_PROPS = {
  cableCar: { width: 96, height: 48 },
  rateLimitGate: { width: 24, height: 48 },
  uBahn: { width: 160, height: 58 },
  baustelle: { width: 48, height: 32 },
  scopeCreep: { width: 32, height: 32 },
} as const;

/**
 * A real level world without canvas or fonts, for tests. Lives next to the
 * world (not in a test file) so every test can share it; production code
 * never imports it.
 */
export function createTestWorld(levelId: LevelId = 'luna', characterId: CharacterId = 'hackerman', seed = 3): World {
  const level = getLevel(levelId);
  return new World({
    stage: STAGES[levelId],
    props: TEST_PROPS,
    characterId,
    highlightIds: getExperience(level.experienceId).highlights.map((highlight) => highlight.id),
    complaints: level.complaints,
    layoutBubble: (text) => ({ lines: [text.slice(0, 14), text.slice(14)], width: 70, height: 19, lineHeight: 10 }),
    rng: new Rng(seed),
    reducedMotion: false,
    screen: { width: 320, height: 240 },
  });
}
