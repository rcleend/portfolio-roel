import { describe, expect, it } from 'vitest';
import {
  AWAY,
  isBusy,
  isClosable,
  isMounted,
  isStarting,
  isWindowShown,
  type PcPhase,
  type SessionEvent,
  type SessionState,
  sessionReducer,
} from './session';

const run = (...events: readonly SessionEvent[]): SessionState => events.reduce(sessionReducer, AWAY);

const LIVE: SessionEvent = { type: 'live', visit: 'first' };
const PATH: readonly SessionEvent[] = [
  LIVE,
  { type: 'select' },
  { type: 'launch' },
  { type: 'splash', status: 'initializing' },
  { type: 'ready' },
  { type: 'open' },
  { type: 'page' },
  { type: 'read' },
];

/** One reachable state per phase, through the normal sequence. */
const AT: Readonly<Record<PcPhase, SessionState>> = {
  away: AWAY,
  desktop: run(LIVE),
  launching: run(LIVE, { type: 'select' }, { type: 'launch' }),
  splash: run(LIVE, { type: 'launch' }, { type: 'splash', status: 'preferences' }),
  opening: run(LIVE, { type: 'launch' }, { type: 'ready' }, { type: 'open' }),
  reader: run(...PATH),
  closing: run(...PATH, { type: 'close', shrink: false }),
};
const PHASES = Object.keys(AT) as PcPhase[];

describe('sessionReducer: the startup', () => {
  it('walks from the landing to the open reader', () => {
    const phases = PATH.map((_, index) => run(...PATH.slice(0, index + 1)).phase);
    expect(phases).toEqual(['desktop', 'desktop', 'launching', 'splash', 'splash', 'opening', 'opening', 'reader']);
    expect(run(...PATH)).toMatchObject({ selected: true, page: true, ready: true });
  });

  it('starts every visit on the desktop with nothing open', () => {
    expect(run(...PATH, { type: 'away' }, { type: 'live', visit: 'warm' })).toEqual({
      ...AWAY,
      phase: 'desktop',
      visit: 'warm',
    });
  });

  it('selects the icon on the first click and launches on the second', () => {
    expect(run(LIVE, { type: 'select' })).toMatchObject({ phase: 'desktop', selected: true });
    expect(AT.launching).toMatchObject({ phase: 'launching', selected: true, ready: false });
  });

  it('changes the splash status line', () => {
    expect(run(LIVE, { type: 'launch' }, { type: 'splash', status: 'initializing' })).toMatchObject({
      phase: 'splash',
      status: 'initializing',
    });
    expect(AT.splash.status).toBe('preferences');
  });

  it('waits for the reader when it is due to open before it is ready', () => {
    const due = run(LIVE, { type: 'launch' }, { type: 'splash', status: 'opening' }, { type: 'open' });
    expect(due).toMatchObject({ phase: 'splash', openPending: true });
    expect(sessionReducer(due, { type: 'ready' })).toMatchObject({ phase: 'opening', openPending: false });
  });

  it('opens at once when the reader was ready first', () => {
    expect(AT.opening).toMatchObject({ phase: 'opening', page: false });
  });

  it('fades the page in, grows out of the glass, then reads', () => {
    expect(sessionReducer(AT.opening, { type: 'page' })).toMatchObject({ phase: 'opening', page: true });
    expect(sessionReducer(AT.opening, { type: 'breakout' })).toMatchObject({ page: true, breakout: true });
    expect(sessionReducer(AT.opening, { type: 'read' })).toMatchObject({ phase: 'reader', page: true });
  });

  it('ignores cues that arrive out of turn', () => {
    expect(sessionReducer(AT.reader, { type: 'launch' })).toBe(AT.reader);
    expect(sessionReducer(AT.reader, { type: 'open' })).toBe(AT.reader);
    expect(sessionReducer(AT.desktop, { type: 'read' })).toBe(AT.desktop);
    expect(sessionReducer(AT.desktop, { type: 'splash', status: 'opening' })).toBe(AT.desktop);
    expect(sessionReducer(AT.desktop, { type: 'ready' })).toBe(AT.desktop);
    expect(sessionReducer(AT.closing, { type: 'page' })).toBe(AT.closing);
  });
});

describe('sessionReducer: skipping', () => {
  it.each(['desktop', 'launching', 'splash'] as const)('waits on the splash for the reader from %s', (phase) => {
    const skipped = sessionReducer(AT[phase], { type: 'skip' });
    expect(skipped).toMatchObject({ phase: 'splash', status: 'opening', skipPending: true });
    expect(sessionReducer(skipped, { type: 'ready' })).toMatchObject({ phase: 'reader', page: true, ready: true });
  });

  it('goes straight to reading once the reader is ready', () => {
    const ready = run(LIVE, { type: 'launch' }, { type: 'ready' });
    expect(sessionReducer(ready, { type: 'skip' })).toMatchObject({ phase: 'reader', page: true });
    expect(sessionReducer(AT.opening, { type: 'skip' })).toMatchObject({ phase: 'reader', breakout: true });
  });

  it.each(['away', 'reader', 'closing'] as const)('does nothing from %s', (phase) => {
    expect(sessionReducer(AT[phase], { type: 'skip' })).toBe(AT[phase]);
  });

  it('is not undone by a late open cue', () => {
    const skipped = sessionReducer(AT.splash, { type: 'skip' });
    expect(sessionReducer(skipped, { type: 'open' })).toMatchObject({ phase: 'splash', skipPending: true });
  });
});

describe('sessionReducer: closing and leaving', () => {
  it.each(['desktop', 'launching', 'splash', 'opening', 'reader'] as const)('closes from %s at once', (phase) => {
    const closing = sessionReducer(AT[phase], { type: 'close', shrink: false });
    expect(closing).toMatchObject({ phase: 'closing', windowGone: true, ready: false });
    expect(isMounted(closing)).toBe(false);
    expect(isWindowShown(closing)).toBe(false);
  });

  it('keeps the window while it shrinks back into the glass', () => {
    const shrinking = sessionReducer(AT.reader, { type: 'close', shrink: true });
    expect(shrinking).toMatchObject({ phase: 'closing', windowGone: false, ready: true });
    expect(isWindowShown(shrinking)).toBe(true);
    const shrunk = sessionReducer(shrinking, { type: 'shrunk' });
    expect(shrunk).toMatchObject({ phase: 'closing', windowGone: true, ready: false });
    expect(sessionReducer(shrunk, { type: 'shrunk' })).toBe(shrunk);
  });

  it('ignores a repeated close or Escape while closing', () => {
    expect(sessionReducer(AT.closing, { type: 'close', shrink: false })).toBe(AT.closing);
    expect(sessionReducer(AT.closing, { type: 'close', shrink: true })).toBe(AT.closing);
    expect(sessionReducer(AWAY, { type: 'close', shrink: false })).toBe(AWAY);
  });

  it.each(PHASES)('returns to away from %s when the room hides the screen', (phase) => {
    const away = sessionReducer(AT[phase], { type: 'away' });
    expect(away.phase).toBe('away');
    expect(isMounted(away)).toBe(false);
    expect(away).toMatchObject({ ready: false, openPending: false, skipPending: false, selected: false });
  });
});

describe('session views', () => {
  it('mounts the reader from the second click until the window is gone', () => {
    expect(PHASES.filter((phase) => isMounted(AT[phase]))).toEqual(['launching', 'splash', 'opening', 'reader']);
  });

  it('shows the window from opening until closing', () => {
    expect(PHASES.filter((phase) => isWindowShown(AT[phase]))).toEqual(['opening', 'reader']);
  });

  it('skips only while the startup plays, and closes from any visible state', () => {
    expect(PHASES.filter((phase) => isStarting(AT[phase]))).toEqual(['desktop', 'launching', 'splash', 'opening']);
    expect(PHASES.filter((phase) => isClosable(AT[phase]))).toEqual([
      'desktop',
      'launching',
      'splash',
      'opening',
      'reader',
    ]);
  });

  it('shows the busy cursor while the reader starts', () => {
    expect(PHASES.filter((phase) => isBusy(AT[phase]))).toEqual(['launching', 'splash']);
  });
});
