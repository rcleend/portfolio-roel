import type { AudioService } from '@/engine/audio/AudioService';

/** Every music track in the game. The audio crew implements one tracker song per id. */
export const MUSIC_IDS = [
  'boot',
  'title',
  'select',
  'mission-select',
  'level-luna',
  'level-scripe',
  'boss',
  'stage-clear',
] as const;

export type MusicId = (typeof MUSIC_IDS)[number];

/** Every sound effect. Scenes reference these names; the audio crew provides one synth recipe each. */
export const SFX_IDS = [
  'power-on',
  'coin',
  'menu-move',
  'menu-confirm',
  'menu-back',
  'typewriter',
  'explosion',
  'flash',
  'jump',
  'land',
  'attack-code',
  'attack-paint',
  'attack-note',
  'skill-full-stack',
  'skill-agent',
  'skill-elixir',
  'skill-power-chord',
  'skill-north-star',
  'skill-shield',
  'hit',
  'hurt',
  'complaint',
  'customer-happy',
  'achievement',
  'checkpoint',
  'pause',
  'stage-clear',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export type GameAudio = AudioService<MusicId, SfxId>;
