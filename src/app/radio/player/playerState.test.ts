import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAYER,
  FADES,
  type PlayerEvent,
  type PlayerState,
  playerReducer,
  type Step,
  type TrackCounts,
} from './playerState';

const COUNTS: TrackCounts = { a: 3, b: 2, single: 1 };
const reduce = (state: PlayerState, event: PlayerEvent): Step => playerReducer(state, event, COUNTS);
/** Runs events in order and returns the final step. */
const run = (state: PlayerState, ...events: PlayerEvent[]): Step =>
  events.reduce<Step>((step, event) => reduce(step.state, event), { state, effects: [] });

const pick = (disc: string): PlayerEvent => ({ type: 'pick', disc });
const seated = (disc: string): PlayerEvent => ({ type: 'seated', disc });
const press = (key: 'play-pause' | 'stop' | 'previous' | 'next'): PlayerEvent => ({ type: 'press', key });
const time = (seconds: number): PlayerEvent => ({ type: 'time', seconds });

/** Disc `a` seated and playing track `track` at `position`. */
const playing = (track = 1, position = 10): PlayerState => ({
  ...EMPTY_PLAYER,
  disc: 'a',
  track,
  transport: 'playing',
  phase: 'ready',
  position,
});
const paused = (track = 1, position = 10): PlayerState => ({ ...playing(track, position), transport: 'paused' });
const stopped = (): PlayerState => ({ ...playing(1, 0), transport: 'stopped' });
const inserting = (): PlayerState => run(EMPTY_PLAYER, pick('a')).state;

describe('picking a disc', () => {
  it('loads it at track 1, playing, going in, reading, and starts it silently', () => {
    expect(reduce(EMPTY_PLAYER, pick('a'))).toEqual({
      state: { ...EMPTY_PLAYER, disc: 'a', transport: 'playing', phase: 'inserting', reading: true },
      effects: [{ type: 'start', swap: false }],
    });
  });

  it('fades out an audible disc first (a swap), but not a paused, stopped or still silent one', () => {
    expect(reduce(playing(2, 40), pick('b')).effects).toEqual([{ type: 'start', swap: true }]);
    expect(reduce(paused(), pick('b')).effects).toEqual([{ type: 'start', swap: false }]);
    expect(reduce(stopped(), pick('b')).effects).toEqual([{ type: 'start', swap: false }]);
    expect(reduce(inserting(), pick('b')).effects).toEqual([{ type: 'start', swap: false }]);
  });

  it('clears a TV pause and an error, and always starts from track 1', () => {
    const atTv = { ...paused(3, 50), pausedByTv: true, error: true };
    expect(reduce(atTv, pick('b')).state).toMatchObject({
      disc: 'b',
      track: 1,
      position: 0,
      pausedByTv: false,
      error: false,
    });
  });

  it('lets the latest pick win, and ignores the loaded disc and unknown ones', () => {
    expect(run(EMPTY_PLAYER, pick('a'), pick('b'), pick('a')).state.disc).toBe('a');
    expect(reduce(playing(), pick('a'))).toEqual({ state: playing(), effects: [] });
    expect(reduce(EMPTY_PLAYER, pick('nope')).state).toBe(EMPTY_PLAYER);
  });
});

describe('seating', () => {
  it('opens the sound once, for the disc going in', () => {
    const step = reduce(inserting(), seated('a'));
    expect(step.state.phase).toBe('ready');
    expect(step.effects).toEqual([{ type: 'open' }]);
    expect(reduce(step.state, seated('a')).effects).toEqual([]);
  });

  it('ignores a superseded insert', () => {
    const swapped = run(EMPTY_PLAYER, pick('a'), pick('b')).state;
    expect(reduce(swapped, seated('a'))).toEqual({ state: swapped, effects: [] });
  });

  it('stays silent when the player was paused meanwhile (the TV, a refused play)', () => {
    const atTv = run(EMPTY_PLAYER, pick('a'), { type: 'tv', entering: true }).state;
    expect(reduce(atTv, seated('a')).effects).toEqual([]);
    const refused = run(EMPTY_PLAYER, pick('a'), { type: 'blocked' }).state;
    expect(reduce(refused, seated('a'))).toMatchObject({ state: { phase: 'ready', transport: 'paused' }, effects: [] });
  });
});

describe('▷II', () => {
  it('pauses a playing disc with a 120 ms fade', () => {
    expect(reduce(playing(), press('play-pause'))).toEqual({
      state: paused(),
      effects: [{ type: 'pause', fadeMs: FADES.pause }],
    });
  });

  it('resumes a paused disc sound-first, from where it was', () => {
    expect(reduce(paused(2, 37), press('play-pause'))).toEqual({
      state: playing(2, 37),
      effects: [{ type: 'play', fadeMs: FADES.resume }],
    });
  });

  it('plays a stopped disc from its current track at once', () => {
    expect(reduce(stopped(), press('play-pause'))).toEqual({
      state: playing(1, 0),
      effects: [{ type: 'play', fadeMs: 0 }],
    });
  });

  it('does nothing with an empty player or a disc still going in', () => {
    expect(reduce(EMPTY_PLAYER, press('play-pause'))).toEqual({ state: EMPTY_PLAYER, effects: [] });
    const going = inserting();
    for (const key of ['play-pause', 'stop', 'next', 'previous'] as const) {
      expect(reduce(going, press(key))).toEqual({ state: going, effects: [] });
    }
  });
});

describe('■', () => {
  it('stops playing or paused discs and goes back to track 1 at 0:00', () => {
    for (const from of [playing(3, 80), paused(2, 15)]) {
      expect(reduce(from, press('stop'))).toEqual({
        state: { ...from, transport: 'stopped', track: 1, position: 0 },
        effects: [{ type: 'pause', fadeMs: FADES.pause }],
      });
    }
  });

  it('does nothing more when already stopped, but clears an error', () => {
    expect(reduce(stopped(), press('stop'))).toEqual({ state: stopped(), effects: [] });
    expect(reduce({ ...stopped(), error: true }, press('stop')).state.error).toBe(false);
  });
});

describe('⏭ and ⏮', () => {
  it('playing: change the track at once and switch the sound after the debounce', () => {
    expect(reduce(playing(1, 30), press('next'))).toEqual({
      state: playing(2, 0),
      effects: [{ type: 'switch', debounce: true }],
    });
    // Three quick presses: each is a debounced switch; the player lands on +3.
    expect(run(playing(1, 5), press('next'), press('next')).state.track).toBe(3);
  });

  it('paused or stopped: select the track and stay so', () => {
    expect(reduce(paused(1, 30), press('next'))).toEqual({ state: paused(2, 0), effects: [] });
    expect(reduce(stopped(), press('next'))).toEqual({ state: { ...stopped(), track: 2 }, effects: [] });
  });

  it('⏭ on the last track does nothing', () => {
    expect(reduce(playing(3, 12), press('next'))).toEqual({ state: playing(3, 12), effects: [] });
  });

  it('⏮ restarts after 3 s, goes back within them, and restarts track 1', () => {
    expect(reduce(playing(2, 3.5), press('previous'))).toEqual({
      state: playing(2, 0),
      effects: [{ type: 'switch', debounce: true }],
    });
    expect(reduce(playing(2, 2.9), press('previous')).state).toEqual(playing(1, 0));
    expect(reduce(playing(1, 1), press('previous')).state).toEqual(playing(1, 0));
    expect(reduce(paused(3, 1), press('previous'))).toEqual({ state: paused(2, 0), effects: [] });
  });
});

describe('the end of a track and of the disc', () => {
  it('plays the next track straight away', () => {
    expect(reduce(playing(1, 51), { type: 'ended' })).toEqual({
      state: playing(2, 0),
      effects: [{ type: 'switch', debounce: false }],
    });
  });

  it('stops after the last, back on track 1', () => {
    expect(reduce(playing(3, 50), { type: 'ended' })).toEqual({ state: { ...stopped(), track: 1 }, effects: [] });
  });

  it('ignores an end while not playing', () => {
    expect(reduce(paused(), { type: 'ended' }).state).toEqual(paused());
  });
});

describe('errors', () => {
  it('playing with a next track: shows the error, then moves on after two seconds', () => {
    const failed = reduce(playing(1, 4), { type: 'error' });
    expect(failed).toEqual({ state: { ...playing(1, 4), error: true }, effects: [{ type: 'schedule-advance' }] });
    expect(reduce(failed.state, { type: 'error-advance' })).toEqual({
      state: playing(2, 0),
      effects: [{ type: 'switch', debounce: false }],
    });
  });

  it('on the last track or while paused: stops on the failed track until the next action', () => {
    expect(reduce(playing(3, 4), { type: 'error' }).state).toEqual({
      ...playing(3, 0),
      transport: 'stopped',
      error: true,
    });
    const shown = reduce(paused(2, 4), { type: 'error' }).state;
    expect(shown).toMatchObject({ transport: 'stopped', track: 2, error: true });
    expect(reduce(shown, press('play-pause')).state).toMatchObject({ transport: 'playing', track: 2, error: false });
  });

  it('a late advance after the visitor acted does nothing', () => {
    const failed = reduce(playing(1, 4), { type: 'error' }).state;
    const acted = reduce(failed, press('play-pause')).state;
    expect(reduce(acted, { type: 'error-advance' }).state).toEqual(acted);
  });

  it('an error during the insert still waits for the seat, then advances', () => {
    const failed = run(EMPTY_PLAYER, pick('a'), { type: 'error' });
    expect(failed.effects).toEqual([{ type: 'schedule-advance' }]);
    expect(run(failed.state, seated('a'), { type: 'error-advance' }).state).toMatchObject({ track: 2, error: false });
  });
});

describe('the TV', () => {
  it('a playing disc yields to the game, and resumes when the visitor looks away', () => {
    const atTv = reduce(playing(2, 20), { type: 'tv', entering: true });
    expect(atTv).toEqual({
      state: { ...paused(2, 20), pausedByTv: true },
      effects: [{ type: 'pause', fadeMs: FADES.tvOut }],
    });
    expect(reduce(atTv.state, { type: 'tv', entering: false })).toEqual({
      state: playing(2, 20),
      effects: [{ type: 'play', fadeMs: FADES.tvBack }],
    });
  });

  it('never overrides the visitor: a paused or stopped disc stays so', () => {
    for (const from of [paused(), stopped(), EMPTY_PLAYER]) {
      const there = reduce(from, { type: 'tv', entering: true }).state;
      expect(there).toEqual(from);
      expect(reduce(there, { type: 'tv', entering: false }).state).toEqual(from);
    }
  });

  it('a disc that went to the TV mid-insert opens on its seat after the visit', () => {
    const away = run(EMPTY_PLAYER, pick('a'), { type: 'tv', entering: true }, { type: 'tv', entering: false });
    expect(away).toMatchObject({ state: { transport: 'playing', phase: 'inserting' }, effects: [] });
    expect(reduce(away.state, seated('a')).effects).toEqual([{ type: 'open' }]);
  });

  it('a visitor pause, stop or pick clears the TV pause', () => {
    const atTv = reduce(playing(), { type: 'tv', entering: true }).state;
    expect(reduce(atTv, { type: 'media', action: 'pause', atTv: true }).state.pausedByTv).toBe(false);
    expect(reduce(atTv, { type: 'media', action: 'stop', atTv: true }).state).toMatchObject({
      pausedByTv: false,
      transport: 'stopped',
    });
    expect(reduce(atTv, pick('b')).state.pausedByTv).toBe(false);
  });
});

describe('the media keys', () => {
  it('play and pause act like ▷II', () => {
    expect(reduce(paused(), { type: 'media', action: 'play', atTv: false }).effects).toEqual([
      { type: 'play', fadeMs: FADES.resume },
    ]);
    expect(reduce(playing(), { type: 'media', action: 'play', atTv: false }).effects).toEqual([]);
    expect(reduce(playing(), { type: 'media', action: 'pause', atTv: false }).state.transport).toBe('paused');
  });

  it('at the TV, play only asks to resume on leaving', () => {
    const asked = reduce(paused(), { type: 'media', action: 'play', atTv: true });
    expect(asked).toEqual({ state: { ...paused(), pausedByTv: true }, effects: [] });
    expect(reduce(asked.state, { type: 'tv', entering: false }).effects).toEqual([
      { type: 'play', fadeMs: FADES.tvBack },
    ]);
    expect(reduce(EMPTY_PLAYER, { type: 'media', action: 'play', atTv: true }).state).toBe(EMPTY_PLAYER);
  });

  it('stop, previous and next act like their keys', () => {
    expect(reduce(playing(2, 9), { type: 'media', action: 'stop', atTv: false }).state).toEqual({
      ...stopped(),
      track: 1,
    });
    expect(reduce(playing(2, 9), { type: 'media', action: 'previoustrack', atTv: false }).state.track).toBe(2);
    expect(reduce(playing(2, 9), { type: 'media', action: 'nexttrack', atTv: false }).state.track).toBe(3);
  });
});

describe('the element', () => {
  it('reports the position while the seated disc plays, which ends the reading', () => {
    const open = run(EMPTY_PLAYER, pick('a'), seated('a')).state;
    expect(open.reading).toBe(true);
    expect(reduce(open, time(0.3)).state).toMatchObject({ position: 0.3, reading: false });
  });

  it('ends the reading with any key, before the first second of sound', () => {
    const open = run(EMPTY_PLAYER, pick('a'), seated('a')).state;
    expect(reduce(open, press('play-pause')).state.reading).toBe(false);
    expect(reduce(open, press('next')).state.reading).toBe(false);
    expect(reduce(open, { type: 'tv', entering: true }).state.reading).toBe(false);
  });

  it('ignores the silent start’s clock and a paused element’s', () => {
    expect(reduce(inserting(), time(0.5)).state).toEqual(inserting());
    expect(reduce(paused(1, 10), time(11)).state.position).toBe(10);
  });

  it('after a refused play, ▷II during the insert starts the disc silently again, inside its gesture', () => {
    const refused = run(EMPTY_PLAYER, pick('a'), { type: 'blocked' }).state;
    expect(reduce(refused, press('play-pause'))).toEqual({
      state: { ...refused, transport: 'playing', reading: true },
      effects: [{ type: 'start', swap: false }],
    });
    expect(reduce(refused, press('next')).state).toEqual(refused);
  });

  it('a refused play pauses, so the next press is a gesture that plays', () => {
    expect(reduce(playing(), { type: 'blocked' }).state.transport).toBe('paused');
    expect(reduce(paused(), { type: 'blocked' }).state).toEqual(paused());
  });

  it('an outside pause shows truthfully', () => {
    expect(reduce(playing(), { type: 'interrupted' }).state).toEqual(paused());
    expect(reduce(inserting(), { type: 'interrupted' }).state).toEqual(inserting());
  });
});

describe('a single-track disc', () => {
  it('ends the disc after its only track and never skips', () => {
    const one = { ...playing(1, 5), disc: 'single' };
    expect(reduce(one, press('next')).effects).toEqual([]);
    expect(reduce(one, { type: 'ended' }).state.transport).toBe('stopped');
    expect(reduce(one, { type: 'error' }).state).toMatchObject({ transport: 'stopped', error: true });
  });
});
