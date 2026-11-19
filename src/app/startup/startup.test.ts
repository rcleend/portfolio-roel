import { describe, expect, it } from 'vitest';
import { INITIAL_STARTUP, type StartupEvent, type StartupState, startupReducer } from './startup';

const run = (...events: StartupEvent[]): StartupState => events.reduce(startupReducer, INITIAL_STARTUP);

describe('startupReducer', () => {
  it('walks loading → powering → running on the game alone, the still up throughout', () => {
    expect(INITIAL_STARTUP).toMatchObject({ phase: 'loading', still: true });
    expect(run({ type: 'gameLoaded' })).toMatchObject({ phase: 'powering', still: true });
    expect(run({ type: 'gameLoaded' }, { type: 'poweredOn' })).toMatchObject({ phase: 'running', still: true });
  });

  it('keeps the still until the room hands over, and drops it for a flat host', () => {
    const room = run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'room' }, { type: 'poweredOn' });
    expect(room).toMatchObject({ host: 'room', still: true });
    expect(startupReducer(room, { type: 'stillDone' })).toMatchObject({ phase: 'running', still: false });
    expect(run({ type: 'hostReady', host: 'flat' })).toMatchObject({ phase: 'loading', host: 'flat', still: false });
  });

  it('is clear once the still is out of sight, and at once for a flat host', () => {
    const room = run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'room' }, { type: 'poweredOn' });
    expect(startupReducer(room, { type: 'stillGone' })).toBe(room);
    const done = startupReducer(room, { type: 'stillDone' });
    expect(done.clear).toBe(false);
    const gone = startupReducer(done, { type: 'stillGone' });
    expect(gone).toMatchObject({ still: false, clear: true });
    expect(startupReducer(gone, { type: 'stillBack' })).toMatchObject({ still: true, clear: false });
    expect(run({ type: 'hostReady', host: 'flat' }).clear).toBe(true);
  });

  it('puts the still back over a room that lost its light, never over a flat host', () => {
    const room = run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'room' }, { type: 'poweredOn' });
    expect(startupReducer(room, { type: 'stillBack' })).toBe(room);
    const live = startupReducer(room, { type: 'stillDone' });
    const covered = startupReducer(live, { type: 'stillBack' });
    expect(covered).toMatchObject({ phase: 'running', host: 'room', still: true });
    expect(startupReducer(covered, { type: 'stillDone' })).toMatchObject({ still: false });
    const flat = run({ type: 'hostReady', host: 'flat' });
    expect(startupReducer(flat, { type: 'stillBack' })).toBe(flat);
  });

  it('ignores power events that arrive out of order', () => {
    expect(run({ type: 'poweredOn' }).phase).toBe('loading');
    const running = run({ type: 'gameLoaded' }, { type: 'poweredOn' });
    expect(startupReducer(running, { type: 'gameLoaded' })).toBe(running);
  });

  it('fails only while loading', () => {
    expect(run({ type: 'gameFailed' }).phase).toBe('failed');
    expect(run({ type: 'gameLoaded' }, { type: 'gameFailed' }).phase).toBe('powering');
  });
});
