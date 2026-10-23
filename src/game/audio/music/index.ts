import type { Song } from '@/engine/audio/sequencer/song';
import type { MusicId } from '../ids';
import { boot } from './boot';
import { boss } from './boss';
import { levelLuna } from './level-luna';
import { levelScripe } from './level-scripe';
import { missionSelect } from './mission-select';
import { select } from './select';
import { stageClear } from './stage-clear';
import { title } from './title';

/** Every track, keyed by id. */
export const music: Readonly<Record<MusicId, Song>> = {
  boot,
  title,
  select,
  'mission-select': missionSelect,
  'level-luna': levelLuna,
  'level-scripe': levelScripe,
  boss,
  'stage-clear': stageClear,
};
