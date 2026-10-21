import { describe, expect, it } from 'vitest';
import { INITIAL_STARTUP, loadingProgress, type StartupEvent, type StartupState, startupReducer } from './startup';

const run = (...events: StartupEvent[]): StartupState => events.reduce(startupReducer, INITIAL_STARTUP);

describe('startupReducer', () => {
  it('walks loading → revealing → powering → running in order', () => {
    const loaded = run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'room' });
    expect(loaded).toMatchObject({ phase: 'revealing', host: 'room' });
    expect(startupReducer(loaded, { type: 'revealed' }).phase).toBe('powering');
    expect(
      run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'flat' }, { type: 'revealed' }, { type: 'poweredOn' }),
    ).toMatchObject({ phase: 'running', host: 'flat' });
  });

  it('waits for the game before revealing', () => {
    expect(run({ type: 'hostReady', host: 'room' }).phase).toBe('loading');
  });

  it('ignores power and reveal events that arrive out of order', () => {
    expect(run({ type: 'poweredOn' }).phase).toBe('loading');
    expect(run({ type: 'revealed' }).phase).toBe('loading');
    const powering = run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'room' }, { type: 'revealed' });
    expect(startupReducer(powering, { type: 'revealed' })).toBe(powering);
  });

  it('fails only while loading', () => {
    expect(run({ type: 'gameFailed' }).phase).toBe('failed');
    expect(run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'flat' }, { type: 'gameFailed' }).phase).toBe(
      'revealing',
    );
  });
});

describe('loadingProgress', () => {
  it('weights the room download over the game assets and never runs backwards', () => {
    expect(loadingProgress(INITIAL_STARTUP)).toBe(0);
    const half = run({ type: 'gameLoaded' }, { type: 'hostProgress', fraction: 0.5 });
    expect(loadingProgress(half)).toBeCloseTo(0.12 + 0.88 * 0.5);
    expect(loadingProgress(startupReducer(half, { type: 'hostProgress', fraction: 0.2 }))).toBeCloseTo(0.56);
  });

  it('clamps bogus fractions and is full once revealed', () => {
    expect(loadingProgress(run({ type: 'hostProgress', fraction: Number.NaN }))).toBe(0);
    expect(loadingProgress(run({ type: 'hostProgress', fraction: 7 }))).toBeCloseTo(0.88);
    expect(loadingProgress(run({ type: 'gameLoaded' }, { type: 'hostReady', host: 'room' }))).toBe(1);
  });
});
