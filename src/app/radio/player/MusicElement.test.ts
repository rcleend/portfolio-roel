import { describe, expect, it, vi } from 'vitest';
import { MusicElement, type MusicListener } from './MusicElement';
import { FakeAudio, FakeFrames } from './testing';

function setup(options: { readonly writableVolume?: boolean } = {}) {
  const audio = new FakeAudio(options);
  const frames = new FakeFrames();
  const create = vi.fn(() => audio);
  const events: string[] = [];
  const listener: MusicListener = {
    playing: () => events.push('playing'),
    time: (seconds) => events.push(`time ${seconds}`),
    ended: () => events.push('ended'),
    error: () => events.push('error'),
    interrupted: () => events.push('interrupted'),
    blocked: () => events.push('blocked'),
  };
  const music = new MusicElement(listener, create, frames);
  return { audio, frames, create, events, music };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('MusicElement', () => {
  it('makes no element, and so no request, before the first pick', () => {
    const { music, create } = setup();
    music.setMuted(true);
    music.setVolume(0.5, 300);
    music.pause(120);
    expect(create).not.toHaveBeenCalled();
    expect(music.element).toBeNull();
  });

  it('starts silently and synchronously, inside the pick', () => {
    const { music, audio } = setup();
    music.startSilently('/a/01.m4a');
    // No await: the play() call itself is what the gesture must cover.
    expect(audio.log).toEqual(['play /a/01.m4a']);
    expect(audio.volume).toBe(0);
    expect(audio.muted).toBe(false);
    expect(audio.preload).toBe('auto');
    expect(music.source).toBe('/a/01.m4a');
  });

  it('rewinds and fades in over 120 ms when the disc is seated', () => {
    const { music, audio, frames } = setup();
    music.startSilently('/a/01.m4a');
    audio.currentTime = 0.83;
    music.open(1, 120);
    expect(audio.currentTime).toBe(0);
    expect(audio.volume).toBe(0);
    frames.tick(64);
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThan(1);
    frames.tick(64);
    expect(audio.volume).toBe(1);
  });

  it('keeps the silent start silent until it is opened: its clock is not the player’s', () => {
    const { music, audio, events } = setup();
    music.startSilently('/a/01.m4a');
    audio.advanceTo(0.5);
    expect(events).toEqual([]);
    music.open(1, 120);
    audio.advanceTo(0.25);
    expect(events).toEqual(['time 0.25']);
  });

  it('uses muted for silence where volume is read-only, and makes every fade instant', () => {
    const { music, audio, frames } = setup({ writableVolume: false });
    music.setMuted(false);
    music.startSilently('/a/01.m4a');
    expect(music.volumeWritable).toBe(false);
    expect(audio.muted).toBe(true);
    // The site's sound toggle cannot unmute a silent start.
    music.setMuted(false);
    expect(audio.muted).toBe(true);
    music.open(1, 120);
    expect(audio.muted).toBe(false);
    music.pause(120);
    expect(audio.paused).toBe(true);
    expect(frames.time).toBe(0);
  });

  it('opens muted when the visitor has turned the sound off', () => {
    const { music, audio } = setup();
    music.setMuted(true);
    music.startSilently('/a/01.m4a');
    music.open(1, 120);
    expect(audio.muted).toBe(true);
    music.setMuted(false);
    expect(audio.muted).toBe(false);
  });

  it('fades a pause out, then pauses where it is; at once on a hidden page', () => {
    const { music, audio, frames, events } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.pause(120);
    expect(audio.paused).toBe(false);
    frames.tick(128);
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);
    expect(events).toEqual([]);
    music.play('/a/01.m4a', 0, 1, 0);
    frames.isHidden = true;
    music.pause(120);
    expect(audio.paused).toBe(true);
  });

  it('ends a fade on time when the tab is hidden mid-fade and frames stop', () => {
    const { music, audio, frames } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.pause(120);
    frames.tick(32);
    frames.stall(200);
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);
    // The frame that comes back later finds nothing left to do.
    music.play('/a/01.m4a', 0, 1, 0);
    frames.tick(100);
    expect(audio.paused).toBe(false);
  });

  it('a new command cancels a fade still running', () => {
    const { music, audio, frames } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.pause(350);
    frames.tick(100);
    music.play('/a/01.m4a', 0, 0.79, 500);
    frames.tick(600);
    expect(audio.paused).toBe(false);
    expect(audio.volume).toBeCloseTo(0.79, 5);
  });

  it('resumes sound first, from where it was, and seeks only when it is somewhere else', () => {
    const { music, audio } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    audio.advanceTo(37.2);
    music.pause(0);
    music.play('/a/01.m4a', 37, 1, 80);
    expect(audio.currentTime).toBe(37.2);
    expect(audio.paused).toBe(false);
    music.play('/a/01.m4a', 0, 1, 80);
    expect(audio.currentTime).toBe(0);
  });

  it('plays a new source from a position once its metadata is known', () => {
    const { music, audio } = setup();
    music.play('/a/02.m4a', 12, 1, 0);
    expect(audio.src).toBe('/a/02.m4a');
    audio.currentTime = 0;
    audio.emit('loadedmetadata');
    expect(audio.currentTime).toBe(12);
  });

  it('fades the playing disc out before it changes the source (a swap)', () => {
    const { music, audio, frames } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.swapSilently('/b/01.m4a', 250);
    frames.tick(128);
    expect(audio.src).toBe('/a/01.m4a');
    expect(audio.volume).toBeGreaterThan(0);
    frames.tick(140);
    expect(audio.src).toBe('/b/01.m4a');
    expect(audio.volume).toBe(0);
    expect(audio.log.at(-1)).toBe('play /b/01.m4a');
  });

  it('opens the new disc when the seat comes before the swap has faded the old one out', () => {
    const { music, audio, frames } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    audio.currentTime = 30;
    music.swapSilently('/b/01.m4a', 250);
    frames.tick(64);
    // Reduced motion seats the disc at once: the old track must not be rewound and opened instead.
    music.open(1, 120);
    expect(audio.src).toBe('/b/01.m4a');
    expect(audio.currentTime).toBe(0);
    frames.tick(300);
    expect(audio.src).toBe('/b/01.m4a');
    expect(audio.volume).toBe(1);
    expect(audio.log.filter((entry) => entry.startsWith('play'))).toEqual(['play /a/01.m4a', 'play /b/01.m4a']);
  });

  it('tells an outside pause from its own and from the end of a track', () => {
    const { music, audio, events } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.quiet();
    expect(events).toEqual([]);
    music.play('/a/01.m4a', 0, 1, 0);
    audio.ended = true;
    audio.pause();
    audio.emit('ended');
    expect(events).toEqual(['ended']);
    audio.ended = false;
    music.play('/a/01.m4a', 0, 1, 0);
    audio.pause();
    expect(events).toEqual(['ended', 'interrupted']);
  });

  it('reports a refused play, but not a play a newer source cancelled', async () => {
    const { music, audio, events } = setup();
    audio.refuse = 'AbortError';
    music.startSilently('/a/01.m4a');
    await flush();
    expect(events).toEqual([]);
    audio.refuse = 'NotAllowedError';
    music.startSilently('/b/01.m4a');
    await flush();
    expect(events).toEqual(['blocked']);
  });

  it('forwards errors and the end of a track', () => {
    const { music, audio, events } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    audio.emit('error');
    audio.emit('ended');
    expect(events).toEqual(['error', 'ended']);
  });

  it('glides to a new perspective while playing, and leaves a paused or silent one alone', () => {
    const { music, audio, frames } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.setVolume(0.56, 300);
    frames.tick(320);
    expect(audio.volume).toBeCloseTo(0.56, 5);
    music.pause(0);
    music.setVolume(1, 300);
    frames.tick(320);
    expect(audio.volume).toBe(0);
  });

  it('is one element for the page, made once', () => {
    const { music, create } = setup();
    music.startSilently('/a/01.m4a');
    music.swapSilently('/b/01.m4a', 0);
    music.play('/b/02.m4a', 0, 1, 0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lets go of the element on dispose', () => {
    const { music, audio } = setup();
    music.play('/a/01.m4a', 0, 1, 0);
    music.dispose();
    expect(audio.paused).toBe(true);
    expect(audio.listenerCount()).toBe(0);
    expect(music.element).toBeNull();
  });
});
