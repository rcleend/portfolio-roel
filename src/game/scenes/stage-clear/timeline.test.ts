import { describe, expect, it } from 'vitest';
import { cuesBetween, stageClearCues, stageClearTimeline } from './timeline';

describe('stageClearTimeline', () => {
  const timeline = stageClearTimeline(16, 4);

  it('runs its beats strictly in order', () => {
    const beats = [
      timeline.letterLand(0),
      timeline.slamEnd,
      timeline.collapse,
      timeline.customers.start,
      timeline.mrr.start,
      timeline.time,
      timeline.record,
      timeline.row(0),
      timeline.row(3),
      timeline.stack,
      timeline.settled,
    ];
    expect([...beats].sort((a, b) => a - b)).toEqual(beats);
    expect(new Set(beats).size).toBe(beats.length);
  });

  it('lands the last letter at the end of the slam', () => {
    expect(timeline.slamEnd).toBe(timeline.letterLand(15));
  });

  it('settles within a few seconds so the tally never drags', () => {
    expect(timeline.settled).toBeLessThan(7);
  });
});

describe('stage-clear cues', () => {
  const timeline = stageClearTimeline(3, 2);

  it('hits once per letter, ticks while counting and celebrates only collected rows', () => {
    const cues = stageClearCues(timeline, { letters: 3, collected: [true, false], newRecord: true });
    expect(cues.filter((cue) => cue.sfx === 'hit')).toHaveLength(3);
    expect(cues.filter((cue) => cue.sfx === 'coin').length).toBeGreaterThan(10);
    expect(cues.filter((cue) => cue.sfx === 'achievement')).toEqual([{ time: timeline.row(0), sfx: 'achievement' }]);
    expect(cues.some((cue) => cue.sfx === 'checkpoint')).toBe(true);
  });

  it('skips the record fanfare when the score is not a record', () => {
    const cues = stageClearCues(timeline, { letters: 3, collected: [], newRecord: false });
    expect(cues.some((cue) => cue.sfx === 'checkpoint')).toBe(false);
  });

  it('fires each cue exactly once across consecutive steps', () => {
    const cues = stageClearCues(timeline, { letters: 3, collected: [true, true], newRecord: true });
    const fired = [];
    for (let frame = 0; frame < 600; frame++) fired.push(...cuesBetween(cues, frame / 60, (frame + 1) / 60));
    expect(fired).toEqual(cues);
  });
});
