import { describe, expect, it } from 'vitest';
import { audioFileInfo, averageKbps, mp3Info, mp4Info } from './audioFiles';

/** A box: 32-bit size, four-character type, payload. */
function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(ascii(type), 4);
  out.set(body, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const zeros = (length: number): Uint8Array => new Uint8Array(length);

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function u64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
}

/** mvhd version 0 or 1 with the given timescale and duration. */
function mvhd(version: 0 | 1, timescale: number, duration: number): Uint8Array {
  const times =
    version === 1 ? [u64(0), u64(0), u32(timescale), u64(duration)] : [u32(0), u32(0), u32(timescale), u32(duration)];
  return box('mvhd', bytes(version, 0, 0, 0), ...times, zeros(80));
}

/** An `mp4a` track whose esds declares MPEG-4 audio (0x40) with `audioObjectType` (2 = AAC LC). */
function audioTrak(audioObjectType: number, sampleEntry = 'mp4a'): Uint8Array {
  const specific = bytes(0x05, 2, (audioObjectType << 3) | 0b010, 0x10);
  const decoderConfig = concat(bytes(0x04, 13 + specific.length, 0x40, 0x15), zeros(11), specific);
  const esDescriptor = concat(bytes(0x03, 3 + decoderConfig.length, 0, 1, 0), decoderConfig);
  const esds = box('esds', zeros(4), esDescriptor);
  const entry = box(sampleEntry, zeros(28), esds);
  const stsd = box('stsd', zeros(4), u32(1), entry);
  return box('trak', box('mdia', box('minf', box('stbl', stsd))));
}

function mp4(order: 'moov-first' | 'mdat-first', moovPayload: Uint8Array[]): Uint8Array {
  const ftyp = box('ftyp', ascii('M4A '), u32(0), ascii('M4A mp42isom'));
  const moov = box('moov', ...moovPayload);
  const mdat = box('mdat', zeros(64));
  return order === 'moov-first' ? concat(ftyp, moov, box('free', zeros(8)), mdat) : concat(ftyp, mdat, moov);
}

describe('mp4Info', () => {
  it('reads the length from mvhd (version 0), the box order and AAC LC', () => {
    const info = mp4Info(mp4('moov-first', [mvhd(0, 44100, 44100 * 52.25), audioTrak(2)]));
    expect(info).toEqual({ kind: 'mp4', seconds: 52.25, moovBeforeMdat: true, codec: 'aac-lc' });
  });

  it('reads a version 1 movie header and flags media data first', () => {
    const info = mp4Info(mp4('mdat-first', [mvhd(1, 1000, 183_500), audioTrak(2)]));
    expect(info.seconds).toBeCloseTo(183.5, 6);
    expect(info.moovBeforeMdat).toBe(false);
  });

  it('tells other AAC profiles and other codecs apart', () => {
    expect(mp4Info(mp4('moov-first', [mvhd(0, 1000, 1000), audioTrak(5)])).codec).toBe('aac');
    expect(mp4Info(mp4('moov-first', [mvhd(0, 1000, 1000), audioTrak(2, 'alac')])).codec).toBe('other');
  });

  it('survives a file without a movie box, or cut short', () => {
    expect(mp4Info(concat(box('ftyp', zeros(8)), box('mdat', zeros(16))))).toEqual({
      kind: 'mp4',
      seconds: null,
      moovBeforeMdat: false,
      codec: null,
    });
    const whole = mp4('moov-first', [mvhd(0, 1000, 2000), audioTrak(2)]);
    expect(mp4Info(whole.subarray(0, whole.length - 30)).seconds).toBe(2);
  });

  it('reads a 64-bit box size', () => {
    const large = concat(u32(1), ascii('mdat'), u64(24), zeros(8));
    const file = concat(box('ftyp', zeros(4)), box('moov', mvhd(0, 10, 25)), large);
    expect(mp4Info(file)).toMatchObject({ seconds: 2.5, moovBeforeMdat: true });
  });
});

/** An MPEG-1 Layer III frame header: 128 kb/s (index 9) at 44.1 kHz, stereo unless `mono`. */
function frameHeader({ kbpsIndex = 9, mono = false, layer = 0b01, version = 0b11 } = {}): Uint8Array {
  const header =
    (0x7ff << 21) | (version << 19) | (layer << 17) | (1 << 16) | (kbpsIndex << 12) | (mono ? 0b11 << 6 : 0);
  return u32(header >>> 0);
}

/** ID3v2 tag of `size` payload bytes (syncsafe). */
function id3(size: number): Uint8Array {
  return concat(
    ascii('ID3'),
    bytes(4, 0, 0, size >> 21, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f),
    zeros(size),
  );
}

describe('mp3Info', () => {
  it('counts frames from a Xing header after an ID3 tag', () => {
    const frame = concat(frameHeader(), zeros(32), ascii('Xing'), u32(0x1), u32(2297), zeros(300));
    const info = mp3Info(concat(id3(100), frame));
    expect(info.mpeg1Layer3).toBe(true);
    expect(info.vbr).toBe(true);
    expect(info.seconds).toBeCloseTo((2297 * 1152) / 44100, 6);
  });

  it('reads an Info header (constant bitrate, LAME) on a mono file', () => {
    const frame = concat(frameHeader({ mono: true }), zeros(17), ascii('Info'), u32(0x1), u32(100), zeros(300));
    const info = mp3Info(frame);
    expect(info.vbr).toBe(false);
    expect(info.seconds).toBeCloseTo((100 * 1152) / 44100, 6);
  });

  it('reads a VBRI header', () => {
    const vbri = concat(ascii('VBRI'), zeros(10), u32(400), zeros(20));
    const info = mp3Info(concat(frameHeader(), zeros(32), vbri, zeros(200)));
    expect(info.seconds).toBeCloseTo((400 * 1152) / 44100, 6);
  });

  it('falls back to the bitrate for constant-bitrate files without a header, minus an ID3v1 tag', () => {
    const audio = concat(frameHeader({ kbpsIndex: 9 }), zeros(16_000 - 4));
    const tag = concat(ascii('TAG'), zeros(125));
    const info = mp3Info(concat(audio, tag));
    expect(info.frameKbps).toBe(128);
    expect(info.seconds).toBeCloseTo((16_000 * 8) / 128_000, 6);
  });

  it('rejects MPEG-2 and Layer II streams and files with no frame', () => {
    expect(mp3Info(concat(frameHeader({ version: 0b10 }), zeros(400))).mpeg1Layer3).toBe(false);
    expect(mp3Info(concat(frameHeader({ layer: 0b10 }), zeros(400))).mpeg1Layer3).toBe(false);
    expect(mp3Info(zeros(400)).seconds).toBeNull();
  });
});

describe('audioFileInfo', () => {
  it('dispatches on the extension', () => {
    expect(audioFileInfo('01-a.M4A', mp4('moov-first', [mvhd(0, 1, 3)]))?.kind).toBe('mp4');
    expect(audioFileInfo('01-a.mp3', concat(frameHeader(), zeros(100)))?.kind).toBe('mp3');
    expect(audioFileInfo('01-a.flac', zeros(10))).toBeNull();
  });

  it('averages a bitrate in kb/s', () => {
    expect(averageKbps(600_000, 60)).toBe(80);
    expect(averageKbps(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
