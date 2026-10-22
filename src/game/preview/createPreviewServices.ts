import { NullAudio } from '@/engine/audio/NullAudio';
import { Rng } from '@/engine/math/Rng';
import type { Looks } from '../art/looks/Looks';
import type { GameAudio, MusicId, SfxId } from '../audio/ids';
import { composeServices } from '../composeServices';
import type { GameResources } from '../resources';
import type { GameServices } from '../services';
import { SessionStore } from '../session';
import { PreviewDirector } from './PreviewDirector';

/** The seed `pnpm shot` uses by default, so a preview's frame N matches a screenshot of frame N. */
const PREVIEW_SEED = 1;

export interface PreviewServicesOptions {
  readonly reducedMotion: boolean;
  /**
   * The art the scene draws heroes, the customer and skills with: the looks
   * the game loaded for its selection, or one assembled from a loaded
   * `LookLibrary` to preview any other selection.
   */
  readonly looks: Looks;
  /** Where the scene's music and effects go; silent when left out. */
  readonly audio?: GameAudio;
  readonly seed?: number;
}

/** A preview's services, its director typed as the stand-in it is. */
export type PreviewServices = GameServices & { readonly director: PreviewDirector };

/**
 * GameServices for one scene shown in isolation: the page's shared
 * resources, the given looks, a fresh in-memory session, a director that
 * records where the scene wants to go instead of going there, and silence
 * unless `audio` is given. Input is not a service; a preview steps its scene
 * with none. Cheap to build, so build one for every run of a preview: the
 * same seed then replays the same run.
 */
export function createPreviewServices(resources: GameResources, options: PreviewServicesOptions): PreviewServices {
  return composeServices((scenes) => new PreviewDirector(scenes), {
    ...resources,
    looks: options.looks,
    audio: options.audio ?? new NullAudio<MusicId, SfxId>(),
    session: new SessionStore(null),
    rng: new Rng(options.seed ?? PREVIEW_SEED),
    settings: { reducedMotion: options.reducedMotion },
    // Only a confirmed choice opens a link, and previews take no input: a preview never leaves the page.
    openLink: () => {},
  });
}
