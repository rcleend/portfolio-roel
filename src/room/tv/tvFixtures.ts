import { Group, type Mesh } from 'three';
import { fitContentRect, type UvRect } from './screenMapping';
import { pictureOutline, type TvFramingModel } from './tvFraming';
import { createTvGlass } from './tvGlass';
import { TV_PICTURE_INSET, TV_SCREEN_APERTURE, type TvModel, tvModelOf } from './tvModel';

/** The game's 320 × 240 picture. */
const GAME_ASPECT = 4 / 3;

export interface TvFixture {
  /** The glass as the room makes it, in the room's space. */
  readonly glass: Mesh;
  /** The game's picture in the glass's UVs, as `CrtScreen` fits it. */
  readonly content: UvRect;
  readonly framing: TvFramingModel;
  readonly model: TvModel;
}

/**
 * For tests: the TV as the room has it, the generated set's measurements (`TV_SPEC`, gen/roomSpec.ts) around the glass
 * `createTvGlass` makes, measured as `CrtScreen` and `assembleRoom` measure it at runtime.
 */
export function tvFixture(): TvFixture {
  const glass = createTvGlass();
  const root = new Group().add(glass);
  root.updateMatrixWorld(true);
  const model = tvModelOf(root, glass);
  const content = fitContentRect(TV_SCREEN_APERTURE, model.screenAspect, GAME_ASPECT, TV_PICTURE_INSET);
  const framing = { facing: model.facing, bounds: model.bounds, picture: pictureOutline(glass, content) };
  return { glass, content, framing, model };
}
