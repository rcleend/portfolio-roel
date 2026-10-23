import { type AudioMeasurement, measure } from '@/engine/audio/mix/meter';
import { channelData, renderSfx, renderSong } from '@/engine/audio/offline';
import { compileSong, loopDuration, songDuration } from '@/engine/audio/sequencer/song';
import { sfxLength } from '@/engine/audio/sfx/recipe';
import type { MusicId, SfxId } from '../ids';
import { music } from '../music';
import { sfx } from '../sfx';

export interface TrackReport extends AudioMeasurement {
  readonly id: MusicId;
  readonly bpm: number;
  /** One pass from the top: intro plus the loop once. */
  readonly passSeconds: number;
  readonly loopSeconds: number | null;
}

export interface SfxReport extends AudioMeasurement {
  readonly id: SfxId;
  /** Trigger to end of the last release. */
  readonly lengthSeconds: number;
}

/** Silence rendered after an effect's nominal end, to prove that it really has ended. */
const SFX_MARGIN = 0.25;

/** Renders one pass of a track (plus its tail) offline and measures it. */
export async function measureTrack(id: MusicId): Promise<TrackReport> {
  const song = compileSong(music[id], id);
  const buffer = await renderSong(song);
  return {
    id,
    bpm: song.bpm,
    passSeconds: songDuration(song),
    loopSeconds: loopDuration(song),
    ...measure(channelData(buffer), buffer.sampleRate),
  };
}

export async function measureSfx(id: SfxId): Promise<SfxReport> {
  const recipe = sfx[id];
  const lengthSeconds = sfxLength(recipe);
  const buffer = await renderSfx(recipe, lengthSeconds + SFX_MARGIN);
  return { id, lengthSeconds, ...measure(channelData(buffer), buffer.sampleRate) };
}
