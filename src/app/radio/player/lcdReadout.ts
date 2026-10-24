import type { LcdReadout, RoomView } from '../deck';
import type { PlayerState } from './playerState';

/** What the room needs to know about the loaded disc to show its totals. */
export interface DiscTotals {
  readonly tracks: number;
  readonly seconds: number;
}

/**
 * The segment display for a player state (SPEC §3.8): `no dISC` while the visitor is at an
 * empty radio, `-- --:--` while a disc goes in, the track and its time while playing or
 * paused, the disc's totals when stopped (or, once ⏭ or ⏮ has chosen another track, that
 * track's number at 00:00, as a real player shows it), the device's own error. Seconds are whole, so
 * the readout (and with it a repaint) changes once a second at most. Away from the radio
 * the display stays lit only while a disc is playing or paused.
 */
export function lcdReadout(state: PlayerState, view: RoomView, disc: DiscTotals | null): LcdReadout {
  const atRadio = view === 'radio';
  if (state.disc === null || disc === null) return atRadio ? { kind: 'no-disc' } : { kind: 'off' };
  if (!atRadio && state.transport === 'stopped') return { kind: 'off' };
  if (state.error) return { kind: 'error' };
  if (state.reading) return { kind: 'reading' };
  if (state.transport === 'stopped') {
    return state.track === 1
      ? { kind: 'total', tracks: disc.tracks, seconds: Math.floor(disc.seconds) }
      : { kind: 'track', track: state.track, seconds: 0, transport: 'stopped' };
  }
  return { kind: 'track', track: state.track, seconds: Math.floor(state.position), transport: state.transport };
}

/** Readouts are values: two are the same display when every field matches. */
export function sameReadout(a: LcdReadout, b: LcdReadout): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'track' && b.kind === 'track') {
    return a.track === b.track && a.seconds === b.seconds && a.transport === b.transport;
  }
  if (a.kind === 'total' && b.kind === 'total') return a.tracks === b.tracks && a.seconds === b.seconds;
  return true;
}
