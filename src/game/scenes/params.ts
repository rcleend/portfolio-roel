import type { CharacterId, LevelId, SkillId } from '@/content';
import type { Scene, Step } from '@/engine/core/Scene';
import type { Action } from '../input/bindings';
import type { TitleBackdropId } from './title/backdrops';
import type { TitleLockupId } from './title/lockups';

/** Which title variants to show; what is left out comes from `TITLE_DEFAULTS`. */
export interface TitleParams {
  readonly lockup?: TitleLockupId;
  readonly backdrop?: TitleBackdropId;
}

export interface LevelSelectParams {
  /** Mission to highlight on entry, e.g. the one just cleared. */
  readonly focus?: LevelId;
}

export interface LevelParams {
  readonly levelId: LevelId;
  readonly characterId: CharacterId;
}

/** What a finished level hands to the stage-clear screen. */
export interface LevelResult {
  readonly score: number;
  /** Ids of the career highlights collected, in pickup order. */
  readonly highlights: readonly string[];
  readonly customersWon: number;
  readonly timeSeconds: number;
}

export interface StageClearParams {
  readonly levelId: LevelId;
  readonly characterId: CharacterId;
  readonly result: LevelResult;
}

/** Scene id → params. `void` means the scene takes no params. */
export interface SceneParamsMap {
  boot: void;
  title: TitleParams | undefined;
  characterSelect: void;
  levelSelect: LevelSelectParams;
  level: LevelParams;
  stageClear: StageClearParams;
}

export interface SpecimenParams {
  /** 0 = type, 1 = characters, 2 = enemy + icons, 3 = UI kit. */
  readonly page?: number;
}

export interface ShowcaseParams {
  /** What loops: the hero's moves (default), one of their skills, or the customer's moods. */
  readonly demo?: 'moves' | 'skill' | 'customer';
  readonly hero?: CharacterId;
  /** The skill the `skill` demo casts; the hero defaults to its owner. */
  readonly skill?: SkillId;
  /** Whose stage the arena stands on: Berlin (`scripe`) unless asked. */
  readonly levelId?: LevelId;
}

/** Development scenes, reachable through the harness (`?scene=specimen`, `?scene=showcase`). */
export interface DevSceneParamsMap {
  specimen: SpecimenParams | undefined;
  showcase: ShowcaseParams | undefined;
}

export type GameSceneMap = SceneParamsMap & DevSceneParamsMap;
export type SceneId = keyof GameSceneMap;

/** A scene of this game: params from the map, input in game actions. */
export type GameScene<P = void> = Scene<P, Action>;

/** One fixed step as seen by a scene of this game. */
export type GameStep = Step<Action>;
