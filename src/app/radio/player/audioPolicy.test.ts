import { describe, expect, it } from 'vitest';
import { radioAudio, tvTransition } from './audioPolicy';

describe('radioAudio', () => {
  it('plays at full level at the radio, −2 dB in the room and −5 dB at the computer', () => {
    expect(radioAudio('radio')).toEqual({ audible: true, volume: 1 });
    expect(20 * Math.log10(radioAudio('room').volume)).toBeCloseTo(-2, 0);
    expect(20 * Math.log10(radioAudio('pc').volume)).toBeCloseTo(-5, 0);
  });

  it('yields to the game at the TV', () => {
    expect(radioAudio('tv')).toEqual({ audible: false, volume: 0 });
  });

  it('applies an album’s gain, which only ever lowers it', () => {
    expect(radioAudio('radio', -6).volume).toBeCloseTo(0.501, 3);
    expect(radioAudio('room', -6).volume).toBeCloseTo(0.79 * 0.501, 3);
    expect(radioAudio('radio', 4).volume).toBe(1);
  });
});

describe('tvTransition', () => {
  it('tells arriving at and leaving the TV from every other move', () => {
    expect(tvTransition('room', 'tv')).toBe(true);
    expect(tvTransition('radio', 'tv')).toBe(true);
    expect(tvTransition('pc', 'tv')).toBe(true);
    expect(tvTransition('tv', 'room')).toBe(false);
    expect(tvTransition('tv', 'radio')).toBe(false);
    expect(tvTransition('room', 'radio')).toBeNull();
    expect(tvTransition('radio', 'pc')).toBeNull();
    expect(tvTransition('tv', 'tv')).toBeNull();
  });
});
