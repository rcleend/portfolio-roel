import type { AssetStore } from '@/engine/assets/AssetStore';
import type { SceneFactories } from '@/engine/core/Director';
import { loadTerrariaDesigns } from '../art/looks/terraria/designs';
import type { Action } from '../input/bindings';
import type { GameServices } from '../services';
import { BootScene } from './boot/BootScene';
import { CharacterSelectScene } from './character-select/CharacterSelectScene';
import { LevelScene } from './level/LevelScene';
import { LevelSelectScene } from './level-select/LevelSelectScene';
import { LineupScene } from './lineup/LineupScene';
import type { GameSceneMap, SceneId } from './params';
import { ShowcaseScene } from './showcase/ShowcaseScene';
import { SpecimenScene } from './specimen/SpecimenScene';
import { StageClearScene } from './stage-clear/StageClearScene';
import { TitleScene } from './title/TitleScene';

/**
 * The scene registry. Each feature crew owns one scene folder and keeps its
 * scene's class name and `(services) => scene` constructor, so this file
 * never needs to change when a stub is replaced.
 *
 * `services` is a getter because the director (part of the services) is built
 * from these factories; scenes are only constructed later, on `goTo`.
 */
export function createSceneFactories(services: () => GameServices): SceneFactories<GameSceneMap, Action> {
  return {
    boot: () => new BootScene(services()),
    title: () => new TitleScene(services()),
    characterSelect: () => new CharacterSelectScene(services()),
    levelSelect: () => new LevelSelectScene(services()),
    level: () => new LevelScene(services()),
    stageClear: () => new StageClearScene(services()),
    specimen: () => new SpecimenScene(services()),
    showcase: () => new ShowcaseScene(services()),
    lineup: () => new LineupScene(services()),
  };
}

const SCENE_IDS: readonly SceneId[] = [
  'boot',
  'title',
  'characterSelect',
  'levelSelect',
  'level',
  'stageClear',
  'specimen',
  'showcase',
  'lineup',
];

/** Narrows untrusted input (URL parameters, the dev console) to a registered scene id. */
export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && (SCENE_IDS as readonly string[]).includes(value);
}

/**
 * Downloads art a development scene draws that the game itself never loads,
 * so the scene can read it synchronously: whoever opens such a scene (the
 * harness, the playground) awaits this first.
 */
export async function preloadSceneArt(id: SceneId, assets: AssetStore): Promise<void> {
  if (id === 'lineup') await loadTerrariaDesigns(assets);
}
