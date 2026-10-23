import { describe, expect, it } from 'vitest';
import { getExperience, getLevel, levels } from '@/content';
import { bundledManifests } from '../../levels/art/LevelArt';
import { GROUND_ROW } from '../../world/map/layout';
import { stageIssues } from './stageIssues';
import { STAGES } from './stages';

describe('stages', () => {
  const manifests = bundledManifests();

  it('defines a stage for every playable level', () => {
    expect(Object.keys(STAGES).sort()).toEqual(levels.map((level) => level.id).sort());
  });

  it.each(Object.values(STAGES))('$levelId is reachable, complete and matches its art', (stage) => {
    const manifest = manifests.get(stage.levelId);
    expect(manifest).toBeDefined();
    expect(stageIssues(stage, manifest?.props ?? {})).toEqual([]);
  });

  it.each(Object.values(STAGES))('$levelId places one highlight block per career highlight', (stage) => {
    const highlights = getExperience(getLevel(stage.levelId).experienceId).highlights;
    expect(stage.layout.blocks).toHaveLength(highlights.length);
  });

  it.each(Object.values(STAGES))('$levelId starts and ends on the ground', (stage) => {
    const { start, goal, ground } = stage.layout;
    expect([start.row, goal.row]).toEqual([GROUND_ROW - 1, GROUND_ROW - 1]);
    expect([ground[start.col], ground[goal.col]]).toEqual([true, true]);
  });

  it('flags a highlight block nobody can reach', () => {
    const luna = STAGES.luna;
    const unreachable = {
      ...luna,
      layout: { ...luna.layout, blocks: [{ col: 4, row: 3 }, ...luna.layout.blocks.slice(1)] },
    };
    expect(stageIssues(unreachable, manifests.get('luna')?.props ?? {})).toContain(
      'the highlight block at column 4 cannot be hit from below',
    );
  });

  it('flags a pit too wide to jump', () => {
    const luna = STAGES.luna;
    const ground = luna.layout.ground.map((present, col) => present && (col < 10 || col > 16));
    const widePit = { ...luna, layout: { ...luna.layout, ground } };
    expect(stageIssues(widePit, manifests.get('luna')?.props ?? {})).toContain(
      'the goal cannot be reached from the start',
    );
  });
});
