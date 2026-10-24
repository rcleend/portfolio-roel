import { describe, expect, it } from 'vitest';
import type { LcdReadout } from '../deck';
import { lcdReadout, sameReadout } from './lcdReadout';
import { EMPTY_PLAYER, type PlayerState } from './playerState';

const DISC = { tracks: 3, seconds: 271.6 };
const loaded = (overrides: Partial<PlayerState>): PlayerState => ({
  ...EMPTY_PLAYER,
  disc: 'a',
  phase: 'ready',
  transport: 'playing',
  ...overrides,
});

describe('lcdReadout', () => {
  it('an empty radio reads "no dISC" at the radio and is off elsewhere', () => {
    expect(lcdReadout(EMPTY_PLAYER, 'radio', null)).toEqual({ kind: 'no-disc' });
    for (const view of ['room', 'pc', 'tv'] as const)
      expect(lcdReadout(EMPTY_PLAYER, view, null)).toEqual({ kind: 'off' });
  });

  it('reads the disc while it goes in', () => {
    expect(lcdReadout(loaded({ phase: 'inserting', reading: true }), 'radio', DISC)).toEqual({ kind: 'reading' });
  });

  it('shows the track and whole seconds while playing or paused, at the radio and away from it', () => {
    const play = loaded({ track: 2, position: 37.9 });
    expect(lcdReadout(play, 'radio', DISC)).toEqual({ kind: 'track', track: 2, seconds: 37, transport: 'playing' });
    expect(lcdReadout({ ...play, transport: 'paused' }, 'room', DISC)).toEqual({
      kind: 'track',
      track: 2,
      seconds: 37,
      transport: 'paused',
    });
    expect(lcdReadout(play, 'pc', DISC).kind).toBe('track');
    expect(lcdReadout(play, 'tv', DISC).kind).toBe('track');
  });

  it('shows the disc’s totals when stopped at the radio, and goes dark elsewhere', () => {
    const stop = loaded({ transport: 'stopped' });
    expect(lcdReadout(stop, 'radio', DISC)).toEqual({ kind: 'total', tracks: 3, seconds: 271 });
    expect(lcdReadout(stop, 'room', DISC)).toEqual({ kind: 'off' });
  });

  it('shows a track chosen while stopped by its number, at 00:00', () => {
    expect(lcdReadout(loaded({ transport: 'stopped', track: 2 }), 'radio', DISC)).toEqual({
      kind: 'track',
      track: 2,
      seconds: 0,
      transport: 'stopped',
    });
    expect(lcdReadout(loaded({ transport: 'stopped', track: 2 }), 'room', DISC)).toEqual({ kind: 'off' });
  });

  it('shows the device’s error', () => {
    expect(lcdReadout(loaded({ error: true }), 'radio', DISC)).toEqual({ kind: 'error' });
    expect(lcdReadout(loaded({ error: true }), 'room', DISC)).toEqual({ kind: 'error' });
    expect(lcdReadout(loaded({ error: true, transport: 'stopped' }), 'room', DISC)).toEqual({ kind: 'off' });
  });
});

describe('sameReadout', () => {
  it('compares readouts field by field', () => {
    const track: LcdReadout = { kind: 'track', track: 1, seconds: 4, transport: 'playing' };
    expect(sameReadout(track, { ...track })).toBe(true);
    expect(sameReadout(track, { ...track, seconds: 5 })).toBe(false);
    expect(sameReadout(track, { ...track, transport: 'paused' })).toBe(false);
    expect(sameReadout({ kind: 'total', tracks: 2, seconds: 90 }, { kind: 'total', tracks: 2, seconds: 91 })).toBe(
      false,
    );
    expect(sameReadout({ kind: 'off' }, { kind: 'off' })).toBe(true);
    expect(sameReadout({ kind: 'off' }, { kind: 'no-disc' })).toBe(false);
  });
});
