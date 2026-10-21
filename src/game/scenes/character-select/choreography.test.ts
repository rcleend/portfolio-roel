import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import {
  cardFlashAlpha,
  LEAVE_AT,
  nameOffset,
  STAMP_AT,
  SWITCH_SECONDS,
  stampJolt,
  stampOpening,
  switchOffsets,
} from './choreography';

describe('switchOffsets', () => {
  it('starts with the new character a full card away and the old one in place', () => {
    expect(switchOffsets(0, 1, 110)).toEqual({ incoming: 110, outgoing: 0, done: false });
    expect(switchOffsets(0, -1, 110)).toEqual({ incoming: -110, outgoing: 0, done: false });
  });

  it('decelerates hard: most of the distance is covered in the first few frames', () => {
    expect(Math.abs(switchOffsets(frames(3), 1, 110).incoming)).toBeLessThan(55);
  });

  it('keeps both halves exactly one card apart, so no gap opens between them', () => {
    for (let frame = 0; frame <= 12; frame++) {
      const { incoming, outgoing } = switchOffsets(frames(frame), 1, 110);
      expect(incoming - outgoing).toBe(110);
    }
  });

  it('lands exactly in place when done', () => {
    expect(switchOffsets(SWITCH_SECONDS, 1, 110)).toEqual({ incoming: 0, outgoing: -110, done: true });
  });
});

describe('nameOffset', () => {
  it('settles from the switch direction to zero', () => {
    expect(nameOffset(0, 1)).toBe(10);
    expect(nameOffset(0, -1)).toBe(-10);
    expect(nameOffset(SWITCH_SECONDS, 1)).toBe(0);
  });
});

describe('cardFlashAlpha', () => {
  it('holds full white for three frames, then steps down to nothing', () => {
    const levels = Array.from({ length: 11 }, (_, frame) => cardFlashAlpha(frames(frame)));
    expect(levels.slice(0, 3)).toEqual([1, 1, 1]);
    expect(levels.at(-1)).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] as number);
    expect(new Set(levels).size).toBeLessThanOrEqual(5);
  });
});

describe('READY! stamp', () => {
  it('is absent until it lands, overshoots once, then settles at full height', () => {
    expect(stampOpening(STAMP_AT - frames(1))).toBeNull();
    const opening = Array.from({ length: 6 }, (_, frame) => stampOpening(STAMP_AT + frames(frame)));
    expect(opening).toEqual([0.12, 0.55, 1.12, 1, 1, 1]);
  });

  it('jolts the card only on the frames after landing', () => {
    expect(stampJolt(STAMP_AT)).toBe(0);
    expect(stampJolt(STAMP_AT + frames(2))).toBe(2);
    expect(stampJolt(STAMP_AT + frames(3))).toBe(-1);
    expect(stampJolt(STAMP_AT + frames(4))).toBe(0);
  });

  it('leaves the screen only after the stamp has settled', () => {
    expect(LEAVE_AT).toBeGreaterThan(STAMP_AT + frames(4));
  });
});
