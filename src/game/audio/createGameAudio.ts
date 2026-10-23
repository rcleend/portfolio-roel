import { NullAudio } from '@/engine/audio/NullAudio';
import { WebAudioService } from '@/engine/audio/WebAudioService';
import type { GameAudio, MusicId, SfxId } from './ids';
import { music } from './music';
import { sfx } from './sfx';

/**
 * The game's sound: the WebAudio synth with every track and effect, or
 * silence where there is no WebAudio (tests, headless tools). The context
 * is only created by the first `unlock()`, so constructing this is free.
 */
export function createGameAudio(): GameAudio {
  if (typeof AudioContext !== 'function') return new NullAudio<MusicId, SfxId>();
  return new WebAudioService<MusicId, SfxId>({ music, sfx });
}
