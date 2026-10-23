import { DEFAULT_MIX, Mixer, type MixLevels } from './mix/Mixer';
import { TrackPlayer } from './music/TrackPlayer';
import { type CompiledSong, songDuration } from './sequencer/song';
import type { SfxRecipe } from './sfx/recipe';
import { SfxPlayer } from './sfx/SfxPlayer';

export interface OfflineRenderOptions {
  readonly sampleRate?: number;
  /** Seconds to render. Defaults to one full pass plus the release and echo tail. */
  readonly seconds?: number;
  /** Repeat the loop section to fill `seconds`. Defaults to false. */
  readonly loop?: boolean;
  readonly levels?: MixLevels;
}

const DEFAULT_SAMPLE_RATE = 44100;

/**
 * Renders a song through the same synth, track player and master bus the
 * game uses, faster than real time. This is how the music is checked
 * without ears: peak, loudness and length are measured on the result.
 */
export async function renderSong(song: CompiledSong, options: OfflineRenderOptions = {}): Promise<AudioBuffer> {
  const seconds = options.seconds ?? songDuration(song) + song.tail;
  const context = offlineContext(seconds, options.sampleRate);
  const mixer = new Mixer(context, context.destination, options.levels ?? DEFAULT_MIX);
  const track = new TrackPlayer(context, mixer.music, 'render', song, {
    startTime: 0,
    loop: options.loop ?? false,
    fadeIn: 0,
  });
  track.schedule(seconds);
  return context.startRendering();
}

/** Renders one trigger of an effect through the effects bus. */
export async function renderSfx(
  recipe: SfxRecipe,
  seconds: number,
  options: Omit<OfflineRenderOptions, 'seconds' | 'loop'> = {},
): Promise<AudioBuffer> {
  const context = offlineContext(seconds, options.sampleRate);
  const mixer = new Mixer(context, context.destination, options.levels ?? DEFAULT_MIX);
  new SfxPlayer(context, mixer.sfx).play('render', recipe);
  return context.startRendering();
}

/** The channels of a rendered buffer, for `measure`. */
export function channelData(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
}

function offlineContext(seconds: number, sampleRate = DEFAULT_SAMPLE_RATE): OfflineAudioContext {
  return new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
}
