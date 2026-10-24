import type { Song } from '@/engine/audio/sequencer/song';
import { attractMode, continueQuestion, highScoreDreams } from './insert-coin';
import { lighthouse, slowWater } from './low-tide';
import { kettleOn, windowSeat } from './night-shift';
import { lastExit, overdrive } from './solar-drive';
import { coffeeBreak, encore } from './sunday-roast';

export interface PlaceholderTrack {
  /** The file's name after its two-digit track number: `01-kettle-on.m4a`. */
  readonly slug: string;
  readonly song: Song;
}

/** Every placeholder album's songs in track order, by album id (src/content/radio/albums.ts). */
export const PLACEHOLDER_SONGS: Readonly<Record<string, readonly PlaceholderTrack[]>> = {
  'night-shift': [
    { slug: 'kettle-on', song: kettleOn },
    { slug: 'window-seat', song: windowSeat },
  ],
  'insert-coin': [
    { slug: 'attract-mode', song: attractMode },
    { slug: 'high-score-dreams', song: highScoreDreams },
    { slug: 'continue', song: continueQuestion },
  ],
  'low-tide': [
    { slug: 'slow-water', song: slowWater },
    { slug: 'lighthouse', song: lighthouse },
  ],
  'solar-drive': [
    { slug: 'overdrive', song: overdrive },
    { slug: 'last-exit', song: lastExit },
  ],
  'sunday-roast': [
    { slug: 'coffee-break', song: coffeeBreak },
    { slug: 'encore', song: encore },
  ],
};

/** `01-kettle-on.m4a` for the first track of an album. */
export function placeholderFile(index: number, slug: string): string {
  return `${String(index + 1).padStart(2, '0')}-${slug}.m4a`;
}
