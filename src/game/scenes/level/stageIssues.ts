import { getExperience, getLevel } from '@/content';
import { jumpEnvelope, MOVEMENT } from '../../entities/player/movement';
import { PLAYER_SIZE } from '../../entities/player/size';
import type { PropSpec } from '../../levels/art/manifest';
import { TILE } from '../../world/grid';
import { type LayoutValidationOptions, validateLayout } from '../../world/map/validateLayout';
import type { StageDefinition } from '../../world/stage';

/** The arena locks the camera, so it must be at least one screen wide. */
const SCREEN_COLUMNS = 320 / TILE;
const BARRIER_TILES = 3;

/** Prop heights the layout validator needs, from the theme and the art manifest. */
export function layoutValidationOptions(
  stage: StageDefinition,
  props: Readonly<Record<string, PropSpec>>,
): LayoutValidationOptions {
  const { mover, barrier } = stage.theme;
  const moverProp = props[mover.prop];
  const barrierProp = barrier ? props[barrier.prop] : undefined;
  return {
    moverRoof: moverProp ? moverProp.h - mover.roofInset : 0,
    barrierTop: barrier && barrierProp ? barrierProp.h - barrier.topInset : 0,
    barrierTiles: BARRIER_TILES,
  };
}

/**
 * Everything that can be wrong with a stage before anyone plays it: layout
 * problems, a highlight block per career highlight, props the theme names
 * but the art does not ship. Empty means sound.
 */
export function stageIssues(stage: StageDefinition, props: Readonly<Record<string, PropSpec>>): string[] {
  const { layout, theme } = stage;
  const issues = validateLayout(layout, jumpEnvelope(MOVEMENT, PLAYER_SIZE.h), layoutValidationOptions(stage, props));

  const highlights = getExperience(getLevel(stage.levelId).experienceId).highlights;
  if (layout.blocks.length !== highlights.length) {
    issues.push(
      `expected ${highlights.length} highlight blocks (one per career highlight), found ${layout.blocks.length}`,
    );
  }
  if (layout.customers.length === 0) issues.push('a stage needs unhappy customers');
  if (layout.columns - layout.arenaCol < SCREEN_COLUMNS) issues.push('the arena must be at least one screen wide');

  const needed = [theme.mover.prop, theme.gate?.prop, theme.slowZone?.prop, theme.barrier?.prop];
  for (const prop of needed) if (prop && !props[prop]) issues.push(`the art has no "${prop}" prop`);
  if (layout.gates.length > 0 && !theme.gate) issues.push('gates are placed but the theme has no gate style');
  if (layout.slowZones.length > 0 && !theme.slowZone) issues.push('slow zones are placed but the theme has none');
  if (layout.barriers.length > 0 && !theme.barrier) issues.push('barriers are placed but the theme has none');
  return issues;
}
