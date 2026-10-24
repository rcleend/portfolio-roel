import { describe, expect, it } from 'vitest';
import { announcement, type DescribeTrack, liveText, playingSentence, SAY, shouldSay } from './announce';
import { EMPTY_PLAYER, type PlayerEvent, type PlayerState, playerReducer } from './playerState';

const TITLES: Readonly<Record<string, readonly string[]>> = { a: ['Kettle On', 'Window Seat'], b: ['Overdrive'] };
const describeTrack: DescribeTrack = (disc, track) => {
  const title = TITLES[disc]?.[track - 1];
  return title
    ? { title, number: track, count: TITLES[disc]?.length ?? 0, album: `Album ${disc}`, artist: 'Studio Attic' }
    : null;
};
const COUNTS = { a: 2, b: 1 };

/** Steps the real reducer and says what the live region would. */
function say(state: PlayerState, event: PlayerEvent, muted = false): { state: PlayerState; words: string | null } {
  const next = playerReducer(state, event, COUNTS).state;
  return { state: next, words: announcement(state, next, event, describeTrack, muted) };
}

const playing: PlayerState = { ...EMPTY_PLAYER, disc: 'a', transport: 'playing', phase: 'ready', position: 12 };

describe('announcement', () => {
  it('names the track a pick starts, in exactly these words', () => {
    expect(say(EMPTY_PLAYER, { type: 'pick', disc: 'a' }).words).toBe(
      'Playing Kettle On, track 1 of 2, from Album a by Studio Attic.',
    );
  });

  it('adds that the sound is off when the visitor muted the site', () => {
    expect(say(EMPTY_PLAYER, { type: 'pick', disc: 'a' }, true).words).toBe(
      'Playing Kettle On, track 1 of 2, from Album a by Studio Attic. Sound is off.',
    );
  });

  it('says Paused., Playing. and Stopped. for the keys', () => {
    const pausedStep = say(playing, { type: 'press', key: 'play-pause' });
    expect(pausedStep.words).toBe('Paused.');
    expect(say(pausedStep.state, { type: 'press', key: 'play-pause' }).words).toBe('Playing.');
    expect(say(playing, { type: 'press', key: 'stop' }).words).toBe('Stopped.');
  });

  it('names a track that starts from the beginning: after ■, a skip while playing, the next track', () => {
    const stopped = say(playing, { type: 'press', key: 'stop' }).state;
    expect(say(stopped, { type: 'press', key: 'play-pause' }).words).toMatch(/^Playing Kettle On, track 1 of 2/);
    expect(say(playing, { type: 'press', key: 'next' }).words).toMatch(/^Playing Window Seat, track 2 of 2/);
    expect(say(playing, { type: 'ended' }).words).toMatch(/^Playing Window Seat/);
  });

  it('says nothing for a restart, a selection while paused or a key on a disc still going in', () => {
    expect(say({ ...playing, position: 30 }, { type: 'press', key: 'previous' }).words).toBeNull();
    expect(say({ ...playing, transport: 'paused' }, { type: 'press', key: 'next' }).words).toBeNull();
    const going = say(EMPTY_PLAYER, { type: 'pick', disc: 'a' }).state;
    expect(say(going, { type: 'press', key: 'play-pause' }).words).toBeNull();
  });

  it('asks for a CD when a key is pressed on an empty player', () => {
    for (const key of ['play-pause', 'stop', 'previous', 'next'] as const) {
      expect(say(EMPTY_PLAYER, { type: 'press', key }).words).toBe('Choose a CD first.');
    }
  });

  it('says the end of the CD, a failed track, a refused play and an outside pause', () => {
    expect(say({ ...playing, track: 2 }, { type: 'ended' }).words).toBe('End of the CD.');
    expect(say(playing, { type: 'error' }).words).toBe('This track could not be played.');
    expect(say(playing, { type: 'blocked' }).words).toBe('Press play to start the music.');
    expect(say(playing, { type: 'interrupted' }).words).toBe('Paused.');
  });

  it('never says the clock, the seat or the TV hand-over', () => {
    expect(say(playing, { type: 'time', seconds: 13 }).words).toBeNull();
    expect(say(say(EMPTY_PLAYER, { type: 'pick', disc: 'a' }).state, { type: 'seated', disc: 'a' }).words).toBeNull();
    expect(say(playing, { type: 'tv', entering: true }).words).toBeNull();
  });

  it('speaks the media keys like the radio’s own', () => {
    expect(say(playing, { type: 'media', action: 'pause', atTv: false }).words).toBe('Paused.');
    expect(say(EMPTY_PLAYER, { type: 'media', action: 'play', atTv: false }).words).toBeNull();
  });

  it('keeps every fixed phrase exactly as written', () => {
    expect(Object.values(SAY)).toEqual([
      'Paused.',
      'Playing.',
      'Stopped.',
      'End of the CD.',
      'This track could not be played.',
      'Choose a CD first.',
      'Press play to start the music.',
      'Sound is off.',
    ]);
    expect(playingSentence({ title: 'T', number: 3, count: 4, album: 'A', artist: 'B' }, false)).toBe(
      'Playing T, track 3 of 4, from A by B.',
    );
  });
});

describe('deduplication', () => {
  it('drops the same words within a second and allows them after', () => {
    expect(shouldSay(null, 'Paused.', 0)).toBe(true);
    expect(shouldSay({ text: 'Paused.', at: 0 }, 'Paused.', 400)).toBe(false);
    expect(shouldSay({ text: 'Paused.', at: 0 }, 'Paused.', 1200)).toBe(true);
    expect(shouldSay({ text: 'Paused.', at: 0 }, 'Playing.', 10)).toBe(true);
  });

  it('changes the live text even when the words repeat, so they are spoken again', () => {
    expect(liveText('Choose a CD first.', '')).toBe('Choose a CD first.');
    expect(liveText('Choose a CD first.', 'Choose a CD first.')).toBe('Choose a CD first. ');
    expect(liveText('Choose a CD first.', 'Choose a CD first. ')).toBe('Choose a CD first.');
  });
});
