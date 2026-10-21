import { bars } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { crash, kick, snare } from '../instruments/drums';
import { bell, brass, fmBass, riser, swellPad } from '../instruments/patches';

/**
 * Boot jingle, E♭ major, two bars = 4.4 s.
 *
 * The tempo makes one beat exactly the 0.55 s logo spin of the boot
 * choreography (docs/ART-DIRECTION.md › Boot), so the music lands on the
 * picture: a bell arpeggio spins in with the logo, the bass climbs
 * A♭ → B♭ → C → D under a swelling pad while the credits type out, a snare
 * roll pulls up, and everything resolves onto E♭ major at 3.99 s, just as
 * "RCL" lights up, then rings through the hold.
 */
export const boot: Song = {
  bpm: 60 / 0.55,
  gain: 1.27,
  echo: { beats: 0.75, feedback: 0.3, tone: 2600 },
  channels: {
    bell: { patch: bell, echo: 0.35, pan: 0.25 },
    pad: { patch: swellPad, play: 'chord' },
    bass: { patch: fmBass, gain: 0.85 },
    brass: { patch: { ...brass, env: { ...brass.env, release: 1.4 } }, echo: 0.2 },
    air: { patch: riser },
    drums: { kit: { k: kick, s: snare, z: [...kick, crash] } },
  },
  patterns: {
    jingle: {
      bell: bars('Ab4 C5 Eb5 Ab5 . . . . Bb4 D5 F5 Bb5 . . . .', 'C5 . Eb5 . G5 . F5 . Bb5 . D6 . F6 Eb6 . .'),
      pad: bars('Ab3[47] . Bb3[47] .', 'C4[37] . . . . . D4[38] . . . . . . Eb4[47] . .'),
      bass: bars('Ab2 . Bb2 .', 'C3 . . . . . D3 . . . . . . Eb2 . .'),
      brass: bars('-', '. . . . . . . . . . . . Bb4:5 Eb5 . .'),
      air: bars('A4 . . .', '. . . . . . . . . . . . . - . .'),
      drums: bars('k:5 . . .', '. . . . . . . . . . s:2 s:4 s:6 z . .'),
    },
  },
  sequence: ['jingle'],
};
