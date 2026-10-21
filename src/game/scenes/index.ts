import type { SceneFactories } from '@/engine/core/Director';
import type { Action } from '../input/bindings';
import type { GameServices } from '../services';
import { BootScene } from './boot/BootScene';
import { CharacterSelectScene } from './character-select/CharacterSelectScene';
import { LevelScene } from './level/LevelScene';
import { LevelSelectScene } from './level-select/LevelSelectScene';
import type { GameSceneMap, SceneId } from './params';
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
];

/** Narrows untrusted input (URL parameters, the dev console) to a registered scene id. */
export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && (SCENE_IDS as readonly string[]).includes(value);
}
