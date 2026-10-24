import type { PlayerEvent, PlayerState } from './playerState';

/**
 * What the radio's one polite live region says (SPEC §8.8): transport changes and track
 * starts, in words, never the clock, a hover or a focus. Pure.
 */

export interface TrackInfo {
  readonly title: string;
  /** 1-based. */
  readonly number: number;
  readonly count: number;
  readonly album: string;
  readonly artist: string;
}

export type DescribeTrack = (disc: string, track: number) => TrackInfo | null;

export const SAY = {
  paused: 'Paused.',
  playing: 'Playing.',
  stopped: 'Stopped.',
  endOfDisc: 'End of the CD.',
  failed: 'This track could not be played.',
  chooseFirst: 'Choose a CD first.',
  pressPlay: 'Press play to start the music.',
  soundOff: 'Sound is off.',
} as const;

/** "Track 2 of 3, High Score Dreams." — a track chosen while paused or stopped (the LCD shows it; this says it). */
export function selectedSentence(track: TrackInfo): string {
  return `Track ${track.number} of ${track.count}, ${track.title}.`;
}

/** "Playing Kettle On, track 1 of 2, from Night Shift by Studio Attic." */
export function playingSentence(track: TrackInfo, muted: boolean): string {
  const sentence = `Playing ${track.title}, track ${track.number} of ${track.count}, from ${track.album} by ${track.artist}.`;
  return muted ? `${sentence} ${SAY.soundOff}` : sentence;
}

/** The words for one step of the player, or null when it says nothing. */
export function announcement(
  previous: PlayerState,
  next: PlayerState,
  event: PlayerEvent,
  describeTrack: DescribeTrack,
  muted: boolean,
): string | null {
  const starting = (): string | null => {
    const track = next.disc === null ? null : describeTrack(next.disc, next.track);
    return track ? playingSentence(track, muted) : null;
  };
  const selected = (): string | null => {
    const track = next.disc === null ? null : describeTrack(next.disc, next.track);
    return track ? selectedSentence(track) : null;
  };
  switch (event.type) {
    case 'pick':
      return next.disc !== previous.disc ? starting() : null;
    case 'press':
      if (previous.disc === null) return SAY.chooseFirst;
      return transportWords(previous, next, starting, selected);
    case 'media':
      return previous.disc === null ? null : transportWords(previous, next, starting, selected);
    case 'ended':
      if (previous.transport === 'playing' && next.transport === 'stopped') return SAY.endOfDisc;
      return next.track !== previous.track ? starting() : null;
    case 'error':
      return next.error && !previous.error ? SAY.failed : null;
    case 'error-advance':
      return next.track !== previous.track ? starting() : null;
    case 'blocked':
      return previous.transport === 'playing' && next.transport === 'paused' ? SAY.pressPlay : null;
    case 'interrupted':
      return previous.transport !== next.transport ? SAY.paused : null;
    default:
      return null;
  }
}

function transportWords(
  previous: PlayerState,
  next: PlayerState,
  starting: () => string | null,
  selected: () => string | null,
): string | null {
  if (previous.transport === 'playing' && next.transport === 'paused') return SAY.paused;
  if (previous.transport !== 'stopped' && next.transport === 'stopped') return SAY.stopped;
  // ⏮ / ⏭ while paused or stopped choose a track without playing it: say which.
  if (next.transport !== 'playing') return next.track !== previous.track ? selected() : null;
  if (previous.transport === 'playing' && next.track === previous.track) return null;
  // A track from its start gets its name; picking up where it was is just "Playing."
  return next.position === 0 ? starting() : SAY.playing;
}

export interface Spoken {
  readonly text: string;
  readonly at: number;
}

/** The same words within this long are one announcement (an action that changes several things at once). */
export const REPEAT_MS = 1000;

export function shouldSay(last: Spoken | null, text: string, now: number): boolean {
  return !(last !== null && last.text === text && now - last.at < REPEAT_MS);
}

/** A live region speaks only a change: the same words again get a trailing no-break space toggled on or off. */
export function liveText(text: string, current: string): string {
  return current === text ? `${text} ` : text;
}
