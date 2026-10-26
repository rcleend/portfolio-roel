import { measure } from '@/engine/audio/mix/meter';
import { channelData, renderSong } from '@/engine/audio/offline';
import { compileSong } from '@/engine/audio/sequencer/song';
import { music } from '@/game/audio/music';
import { PLACEHOLDER_SONGS } from './songs';

/**
 * The radio's authoring page (scripts/radio/render.html, served by the Vite dev server that
 * `render-placeholders.ts` and `verify-radio.ts --loudness` start): renders a placeholder song
 * offline through the game's own synth and master bus, matches its loudness to the game's
 * first stage and hands back a 16-bit WAV for the encoder; and measures any album's file
 * against the same reference.
 */

export interface RenderedTrack {
  /** Base64 of a 44.1 kHz, 16-bit stereo WAV. */
  readonly wav: string;
  readonly seconds: number;
  readonly loudnessDb: number;
  readonly peakDb: number;
  /** Track gain the song was rendered at after loudness matching. */
  readonly gain: number;
}

declare global {
  interface Window {
    __radioRender?: {
      /** Gated loudness of one pass of the game's `level-luna`, which every placeholder matches. */
      reference(): Promise<number>;
      render(album: string, index: number, targetDb: number): Promise<RenderedTrack>;
      /** Gated loudness of an audio file (`pnpm verify:radio --loudness`; authoring only, never the site). */
      loudness(url: string): Promise<number>;
    };
  }
}

/** Close enough to stop re-rendering; what is left is applied as a plain gain. */
const SETTLE_DB = 0.25;
/** Headroom kept below full scale, like the game's own renders. */
const MAX_PEAK = 10 ** (-1.2 / 20);
/** The end of a track is where its last echo has fallen to -66 dBFS. */
const SILENCE = 10 ** (-66 / 20);
/** A short fade over the very end, so the cut is never a click. */
const FADE_SECONDS = 0.05;

async function reference(): Promise<number> {
  const buffer = await renderSong(compileSong(music['level-luna'], 'level-luna'));
  return measure(channelData(buffer), buffer.sampleRate).loudnessDb;
}

async function render(album: string, index: number, targetDb: number): Promise<RenderedTrack> {
  const track = PLACEHOLDER_SONGS[album]?.[index];
  if (!track) throw new Error(`No placeholder song ${album} #${index + 1}`);
  // The master bus compresses, so loudness is not linear in gain: render, correct, render again.
  let gain = track.song.gain ?? 1;
  let buffer = await renderAt(track.song, gain);
  for (let attempt = 0; attempt < 2; attempt++) {
    const error = targetDb - measure(channelData(buffer), buffer.sampleRate).loudnessDb;
    if (Math.abs(error) <= SETTLE_DB) break;
    gain *= 10 ** (error / 20);
    buffer = await renderAt(track.song, gain);
  }
  const channels = trimmed(channelData(buffer));
  const before = measure(channels, buffer.sampleRate);
  const residual = Math.min(10 ** ((targetDb - before.loudnessDb) / 20), MAX_PEAK / before.peak);
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] = (channel[i] ?? 0) * residual;
  fadeOut(channels, buffer.sampleRate);
  const after = measure(channels, buffer.sampleRate);
  return {
    wav: base64(wav(channels, buffer.sampleRate)),
    seconds: after.seconds,
    loudnessDb: after.loudnessDb,
    peakDb: after.peakDb,
    gain: gain * residual,
  };
}

function renderAt(song: Parameters<typeof compileSong>[0], gain: number): Promise<AudioBuffer> {
  return renderSong(compileSong({ ...song, gain }));
}

/** The channels cut just after the last sample above `SILENCE`. */
function trimmed(channels: Float32Array[]): Float32Array[] {
  let end = 0;
  for (const channel of channels) {
    for (let i = channel.length - 1; i > end; i--) {
      if (Math.abs(channel[i] ?? 0) > SILENCE) {
        end = i;
        break;
      }
    }
  }
  return channels.map((channel) => channel.slice(0, end + 1));
}

function fadeOut(channels: Float32Array[], sampleRate: number): void {
  const length = Math.round(FADE_SECONDS * sampleRate);
  for (const channel of channels) {
    for (let i = 0; i < length && i < channel.length; i++) {
      const index = channel.length - 1 - i;
      channel[index] = (channel[index] ?? 0) * (i / length);
    }
  }
}

/** Interleaved 16-bit PCM with a RIFF header. */
function wav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const data = frames * count * 2;
  const out = new DataView(new ArrayBuffer(44 + data));
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) out.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  out.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, count, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * count * 2, true);
  out.setUint16(32, count * 2, true);
  out.setUint16(34, 16, true);
  text(36, 'data');
  out.setUint32(40, data, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
      out.setInt16(offset, Math.round(sample * 32767), true);
      offset += 2;
    }
  }
  return new Uint8Array(out.buffer);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function loudness(url: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const context = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: 44100 });
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  return measure(channelData(buffer), buffer.sampleRate).loudnessDb;
}

window.__radioRender = { reference, render, loudness };
