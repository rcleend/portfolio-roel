import { describe, expect, it } from 'vitest';
import { compileSong, loopDuration, songDuration } from '@/engine/audio/sequencer/song';
import { tickToSeconds } from '@/engine/audio/sequencer/timing';
import { MUSIC_IDS } from '../ids';
import { music } from '.';

const compiled = Object.fromEntries(MUSIC_IDS.map((id) => [id, compileSong(music[id], id)]));
const of = (id: (typeof MUSIC_IDS)[number]) => {
  const song = compiled[id];
  if (!song) throw new Error(`missing ${id}`);
  return song;
};

describe('music', () => {
  it.each(MUSIC_IDS)('%s compiles to a non-empty song', (id) => {
    const song = of(id);
    expect(song.events.length).toBeGreaterThan(20);
    // Releases plus echo repeats down to -60 dB: bounds how long a finished track keeps its nodes.
    expect(song.tail).toBeLessThan(10);
  });

  it('times the boot jingle to the boot choreography', () => {
    const boot = of('boot');
    expect(boot.loopTick).toBeNull();
    expect(songDuration(boot)).toBeCloseTo(4.4, 2);
    // The resolution chord lands while "RCL" fades in (4.00–4.40 s) and rings through the hold.
    const lastAttack = Math.max(...boot.events.map((event) => tickToSeconds(boot.timing, event.tick)));
    expect(lastAttack).toBeGreaterThanOrEqual(3.95);
    expect(lastAttack).toBeLessThan(4.4);
    // Every note has released before the boot cuts to black at 6.4 s.
    const lastRelease = Math.max(
      ...boot.events.map((event) => {
        const env = event.patch.env;
        const release = event.oneShot
          ? tickToSeconds(boot.timing, event.tick) + env.attack + env.decay
          : tickToSeconds(boot.timing, event.endTick);
        return release + env.release;
      }),
    );
    expect(lastRelease).toBeLessThan(6.4);
  });

  it('gives the first stage a loop of 60–90 s so a run rarely hears it twice', () => {
    const loop = loopDuration(of('level-luna'));
    expect(loop).toBeGreaterThanOrEqual(60);
    expect(loop).toBeLessThanOrEqual(90);
  });

  it('gives the second stage and the menus loops long enough not to grate', () => {
    expect(loopDuration(of('level-scripe'))).toBeGreaterThanOrEqual(55);
    for (const id of ['title', 'select', 'mission-select', 'boss'] as const) {
      expect(loopDuration(of(id))).toBeGreaterThanOrEqual(20);
      expect(loopDuration(of(id))).toBeLessThanOrEqual(60);
    }
  });

  it('plays the stage-clear fanfare once, then loops the results tune', () => {
    const song = of('stage-clear');
    expect(song.loopTick).toBeGreaterThan(0);
    expect(songDuration(song) - (loopDuration(song) ?? 0)).toBeLessThan(4);
  });

  it('keeps four on the floor in the Berlin stage', () => {
    const song = of('level-scripe');
    const kicks = song.events.filter((event) => event.channel === 'kick' && event.tick < song.ticksPerBar * 12);
    const beats = new Set(kicks.map((event) => event.tick / 24));
    for (let beat = 0; beat < 48; beat++) expect(beats.has(beat)).toBe(true);
  });
});
