import type { Patch } from '../synth/patch';
import { note as parseNoteName } from '../synth/pitch';
import { type LaneStep, parseLane } from './lane';
import { TICKS_PER_BEAT, type Timing, tickToSeconds, timing } from './timing';

/**
 * A song in tracker form: channels (one instrument each), patterns (a lane of
 * text per channel, see `lane.ts`) and an arrangement that plays patterns in
 * order, optionally transposed, and loops back to `loopFrom`.
 *
 *   const song: Song = {
 *     bpm: 120,
 *     channels: { bass: { patch: fmBass }, drums: { kit: { k: kick, s: snare } } },
 *     patterns: { A: { bass: 'C2 . C3 . | Bb1 . Bb2 .', drums: 'k s k s | k s k k:6' } },
 *     sequence: ['A', 'A+5', 'A'],
 *     loopFrom: 0,
 *   };
 */
export interface Song {
  readonly bpm: number;
  /** Defaults to 4. */
  readonly beatsPerBar?: number;
  /** Delay of every second 16th, as a fraction of a 16th: 0 straight, 1/3 a triplet shuffle. */
  readonly swing?: number;
  /** Track gain, for matching loudness between songs. Defaults to 1. */
  readonly gain?: number;
  /** A tempo-synced feedback echo that channels can send to. */
  readonly echo?: EchoSettings;
  readonly channels: Readonly<Record<string, Channel>>;
  readonly patterns: Readonly<Record<string, Pattern>>;
  /** Pattern names in play order; `name+N` / `name-N` transposes melodic channels by N semitones. */
  readonly sequence: readonly string[];
  /** Index into `sequence` where the loop restarts. Omit for a one-shot (jingle, fanfare). */
  readonly loopFrom?: number;
}

/** A lane per channel. Channels without a lane rest for the pattern. */
export type Pattern = Readonly<Record<string, string>>;

export interface EchoSettings {
  /** Delay time in beats (0.75 is a dotted eighth). */
  readonly beats: number;
  /** 0–1: how much of each repeat feeds the next. */
  readonly feedback: number;
  /** Low-pass cutoff inside the loop so repeats darken like tape. Defaults to 3 kHz. */
  readonly tone?: number;
}

interface ChannelBase {
  /** Defaults to 1. */
  readonly gain?: number;
  readonly pan?: number;
  /** Send level to the song's echo, 0–1. */
  readonly echo?: number;
}

export interface MelodicChannel extends ChannelBase {
  readonly patch: Patch;
  /** How bracketed intervals (`C4[47]`) sound: cycled as an arpeggio (default) or together as a chord. */
  readonly play?: 'arpeggio' | 'chord';
}

/** Drum channel: tokens name kit pieces, which are one-shots that never transpose. */
export interface KitChannel extends ChannelBase {
  readonly kit: Kit;
}

export type Channel = MelodicChannel | KitChannel;

/** A piece is one voice, or several layered (a snare's noise and body). */
export type Kit = Readonly<Record<string, KitPiece | readonly KitPiece[]>>;

export interface KitPiece {
  readonly patch: Patch;
  readonly note: string;
}

/** One note of the arrangement, on the song's tick grid. */
export interface SongEvent {
  readonly tick: number;
  readonly channel: string;
  readonly patch: Patch;
  readonly midi: number;
  readonly velocity: number;
  /** Release tick for held notes; one-shots (kit hits) play their patch's natural length instead. */
  readonly endTick: number;
  readonly oneShot: boolean;
  readonly arpeggio: readonly number[];
  readonly chord: readonly number[];
  readonly slides: readonly { readonly tick: number; readonly midi: number }[];
}

export interface ChannelMix {
  readonly id: string;
  readonly gain: number;
  readonly pan: number;
  readonly echo: number;
}

/** A song flattened into time-ordered events: what the scheduler and the checks consume. */
export interface CompiledSong {
  readonly timing: Timing;
  readonly bpm: number;
  readonly ticksPerBar: number;
  readonly totalTicks: number;
  /** Tick the loop restarts from, or `null` for a one-shot. */
  readonly loopTick: number | null;
  readonly events: readonly SongEvent[];
  readonly channels: readonly ChannelMix[];
  readonly gain: number;
  readonly echo: EchoSettings | null;
  /** Seconds after the last tick until every release and echo has died away. */
  readonly tail: number;
}

export class SongError extends Error {
  override readonly name = 'SongError';
}

const SEQUENCE_ENTRY = /^([A-Za-z0-9_]+)([+-]\d+)?$/;

export function isKitChannel(channel: Channel): channel is KitChannel {
  return 'kit' in channel;
}

/** Validates and flattens a song. Throws `SongError`/`LaneError` naming the bad pattern, channel and bar. */
export function compileSong(song: Song, name = 'song'): CompiledSong {
  const beatsPerBar = song.beatsPerBar ?? 4;
  const ticksPerBar = beatsPerBar * TICKS_PER_BEAT;
  const time = timing(song.bpm, song.swing ?? 0);
  if (song.sequence.length === 0) throw new SongError(`${name}: the sequence is empty`);
  if (song.loopFrom !== undefined && !(song.loopFrom >= 0 && song.loopFrom < song.sequence.length)) {
    throw new SongError(`${name}: loopFrom ${song.loopFrom} is outside the sequence`);
  }

  const channelIds = Object.keys(song.channels);
  const lanes = new Map<string, LaneStep[]>(channelIds.map((id) => [id, []]));
  let cursor = 0;
  let loopTick: number | null = null;
  song.sequence.forEach((entry, index) => {
    if (index === song.loopFrom) loopTick = cursor;
    const match = SEQUENCE_ENTRY.exec(entry);
    const pattern = match ? song.patterns[match[1] ?? ''] : undefined;
    if (!match || !pattern) throw new SongError(`${name}: sequence entry "${entry}" names no pattern`);
    const transpose = Number(match[2] ?? 0);
    const bars = patternBars(song, pattern, ticksPerBar, `${name}, pattern ${match[1]}`);
    for (const id of channelIds) {
      const channel = song.channels[id];
      const steps = lanes.get(id);
      if (!channel || !steps) continue;
      const lane = pattern[id];
      if (lane === undefined) {
        // A channel absent from a pattern rests: release whatever it was holding.
        steps.push({ tick: cursor, token: { kind: 'off' } });
        continue;
      }
      const kit = isKitChannel(channel);
      for (const step of parseLane(lane, kit ? 'kit' : 'melodic', ticksPerBar, `${name}, ${match[1]}.${id}`).steps) {
        const token =
          !kit && transpose !== 0 && step.token.kind === 'note'
            ? { ...step.token, midi: step.token.midi + transpose }
            : step.token;
        steps.push({ tick: cursor + step.tick, token });
      }
    }
    cursor += bars * ticksPerBar;
  });

  const events: SongEvent[] = [];
  for (const id of channelIds) {
    const channel = song.channels[id];
    if (channel) events.push(...channelEvents(id, channel, lanes.get(id) ?? [], cursor, name));
  }
  events.sort((a, b) => a.tick - b.tick);

  return {
    timing: time,
    bpm: song.bpm,
    ticksPerBar,
    totalTicks: cursor,
    loopTick,
    events,
    channels: channelIds.map((id) => {
      const channel = song.channels[id];
      return { id, gain: channel?.gain ?? 1, pan: channel?.pan ?? 0, echo: channel?.echo ?? 0 };
    }),
    gain: song.gain ?? 1,
    echo: song.echo ?? null,
    tail: songTail(song, events),
  };
}

/** Seconds of one full pass through the song, start to end. */
export function songDuration(song: CompiledSong): number {
  return tickToSeconds(song.timing, song.totalTicks);
}

/** Seconds of the looping section, or `null` for a one-shot. */
export function loopDuration(song: CompiledSong): number | null {
  if (song.loopTick === null) return null;
  return songDuration(song) - tickToSeconds(song.timing, song.loopTick);
}

function patternBars(song: Song, pattern: Pattern, ticksPerBar: number, where: string): number {
  let bars: number | null = null;
  for (const [id, lane] of Object.entries(pattern)) {
    const channel = song.channels[id];
    if (!channel) throw new SongError(`${where}: lane for unknown channel "${id}"`);
    const laneBars = parseLane(lane, isKitChannel(channel) ? 'kit' : 'melodic', ticksPerBar, `${where}.${id}`).bars;
    if (bars !== null && laneBars !== bars) {
      throw new SongError(`${where}: lane "${id}" has ${laneBars} bars, the others have ${bars}`);
    }
    bars = laneBars;
  }
  if (bars === null || bars === 0) throw new SongError(`${where}: the pattern has no lanes`);
  return bars;
}

function channelEvents(
  id: string,
  channel: Channel,
  steps: readonly LaneStep[],
  endTick: number,
  name: string,
): SongEvent[] {
  const events: SongEvent[] = [];
  if (isKitChannel(channel)) {
    for (const { tick, token } of steps) {
      if (token.kind !== 'hit') continue;
      const piece = channel.kit[token.piece];
      if (!piece) throw new SongError(`${name}: channel "${id}" has no kit piece "${token.piece}"`);
      for (const layer of 'patch' in piece ? [piece] : piece) {
        events.push({
          tick,
          channel: id,
          patch: layer.patch,
          midi: parseNoteName(layer.note),
          velocity: token.velocity,
          endTick: tick,
          oneShot: true,
          arpeggio: [],
          chord: [],
          slides: [],
        });
      }
    }
    return events;
  }

  const finish = (note: OpenNote | null, tick: number): void => {
    if (note && tick > note.tick) events.push({ ...note, endTick: tick });
  };
  const asChord = channel.play === 'chord';
  let open: OpenNote | null = null;
  for (const { tick, token } of steps) {
    if (token.kind === 'off') {
      finish(open, tick);
      open = null;
    } else if (token.kind === 'note') {
      if (token.slide && open) {
        open.slides.push({ tick, midi: token.midi });
        continue;
      }
      finish(open, tick);
      open = {
        tick,
        channel: id,
        patch: channel.patch,
        midi: token.midi,
        velocity: token.velocity,
        oneShot: false,
        arpeggio: asChord ? [] : token.intervals,
        chord: asChord ? token.intervals : [],
        slides: [],
      };
    }
  }
  finish(open, endTick);
  return events;
}

/** A held note whose release tick is not known yet. */
type OpenNote = Omit<SongEvent, 'endTick' | 'slides'> & { slides: { tick: number; midi: number }[] };

function songTail(song: Song, events: readonly SongEvent[]): number {
  let tail = 0;
  for (const event of events) {
    const env = event.patch.env;
    tail = Math.max(tail, env.release + (event.oneShot ? env.attack + env.decay : 0));
  }
  if (song.echo && song.echo.feedback > 0) {
    // Repeats until the echo has fallen 60 dB.
    const repeats = Math.log(1e-3) / Math.log(Math.min(song.echo.feedback, 0.95));
    tail += (song.echo.beats * 60 * repeats) / song.bpm;
  }
  return tail;
}
