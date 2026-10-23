/**
 * What `pnpm verify:radio` and `albums.test.ts` need to know about an audio
 * file without decoding it: its length, its codec and whether it can stream
 * from the first byte. Pure functions over the file's bytes.
 */

export interface Mp4Info {
  readonly kind: 'mp4';
  /** `mvhd` duration over its timescale; null without a movie header. */
  readonly seconds: number | null;
  /** The movie box comes before the media data, so playback can start before the whole file arrives. */
  readonly moovBeforeMdat: boolean;
  /** `aac-lc` for MPEG-4 AAC Low Complexity, `aac` for another AAC profile, `other` for anything else. */
  readonly codec: 'aac-lc' | 'aac' | 'other' | null;
}

export interface Mp3Info {
  readonly kind: 'mp3';
  /** From the Xing/Info or VBRI frame count, else from the first frame's bitrate (constant bitrate). */
  readonly seconds: number | null;
  /** The first frame is MPEG-1 Layer III (the only MP3 flavour every browser decodes). */
  readonly mpeg1Layer3: boolean;
  /** The first frame's bitrate in kb/s (the average for VBR files is bytes over seconds). */
  readonly frameKbps: number | null;
  readonly vbr: boolean;
}

export type AudioFileInfo = Mp4Info | Mp3Info;

/** Reads a file by its extension: `.m4a`/`.mp4` as MP4, `.mp3` as MP3; null for anything else. */
export function audioFileInfo(name: string, bytes: Uint8Array): AudioFileInfo | null {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'm4a' || extension === 'mp4') return mp4Info(bytes);
  if (extension === 'mp3') return mp3Info(bytes);
  return null;
}

/** Average bitrate in kb/s (1000 bits) of `bytes` over `seconds`. */
export function averageKbps(byteLength: number, seconds: number): number {
  return seconds > 0 ? (byteLength * 8) / seconds / 1000 : Number.POSITIVE_INFINITY;
}

// ── MP4 ────────────────────────────────────────────────────────────────────────

interface Box {
  readonly type: string;
  /** Offset of the box's payload (after its header). */
  readonly start: number;
  /** Offset just past the box. */
  readonly end: number;
}

/** Boxes laid end to end in `bytes[from, to)`; stops at the first malformed header. */
function boxes(bytes: Uint8Array, from: number, to: number): Box[] {
  const view = viewOf(bytes);
  const found: Box[] = [];
  let offset = from;
  while (offset + 8 <= to) {
    let size = view.getUint32(offset);
    const type = fourCc(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > to) break;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < header || offset + size > to) {
      // A truncated last box (a partial download) still tells us its type and where it starts.
      found.push({ type, start: offset + header, end: to });
      break;
    }
    found.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

function child(bytes: Uint8Array, parent: Box | undefined, type: string, skip = 0): Box | undefined {
  if (!parent) return undefined;
  return boxes(bytes, parent.start + skip, parent.end).find((box) => box.type === type);
}

export function mp4Info(bytes: Uint8Array): Mp4Info {
  const top = boxes(bytes, 0, bytes.length);
  const moovIndex = top.findIndex((box) => box.type === 'moov');
  const mdatIndex = top.findIndex((box) => box.type === 'mdat');
  const moov = top[moovIndex];
  return {
    kind: 'mp4',
    seconds: moov ? movieSeconds(bytes, moov) : null,
    moovBeforeMdat: moovIndex >= 0 && (mdatIndex < 0 || moovIndex < mdatIndex),
    codec: moov ? audioCodec(bytes, moov) : null,
  };
}

function movieSeconds(bytes: Uint8Array, moov: Box): number | null {
  const mvhd = child(bytes, moov, 'mvhd');
  if (!mvhd) return null;
  const view = viewOf(bytes);
  const version = bytes[mvhd.start];
  if (version === 1) {
    if (mvhd.start + 32 > mvhd.end) return null;
    const timescale = view.getUint32(mvhd.start + 20);
    const duration = Number(view.getBigUint64(mvhd.start + 24));
    return timescale > 0 ? duration / timescale : null;
  }
  if (mvhd.start + 20 > mvhd.end) return null;
  const timescale = view.getUint32(mvhd.start + 12);
  const duration = view.getUint32(mvhd.start + 16);
  return timescale > 0 ? duration / timescale : null;
}

/** The first track's sample description: `mp4a` with an MPEG-4 audio `esds` is AAC; its profile is the object type. */
function audioCodec(bytes: Uint8Array, moov: Box): Mp4Info['codec'] {
  for (const trak of boxes(bytes, moov.start, moov.end).filter((box) => box.type === 'trak')) {
    const stbl = child(bytes, child(bytes, child(bytes, trak, 'mdia'), 'minf'), 'stbl');
    const stsd = child(bytes, stbl, 'stsd');
    if (!stsd) continue;
    // stsd: version and flags (4) and an entry count (4) before its sample entries.
    const entry = boxes(bytes, stsd.start + 8, stsd.end)[0];
    if (!entry) continue;
    if (entry.type !== 'mp4a') return 'other';
    // An audio sample entry has 28 bytes of fields before its child boxes.
    const esds = child(bytes, entry, 'esds', 28);
    return esds ? aacProfile(bytes, esds) : 'other';
  }
  return null;
}

function aacProfile(bytes: Uint8Array, esds: Box): Mp4Info['codec'] {
  let offset = esds.start + 4; // version and flags
  const descriptor = (expected: number): number | null => {
    if (bytes[offset] !== expected) return null;
    offset++;
    let length = 0;
    for (let i = 0; i < 4; i++) {
      const byte = bytes[offset++] ?? 0;
      length = (length << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return length;
  };
  if (descriptor(0x03) === null) return 'other';
  const flags = bytes[offset + 2] ?? 0;
  offset += 3; // ES_ID and flags
  if (flags & 0x80) offset += 2; // dependsOn_ES_ID
  if (flags & 0x40) offset += 1 + (bytes[offset] ?? 0); // URL
  if (flags & 0x20) offset += 2; // OCR_ES_Id
  if (descriptor(0x04) === null) return 'other';
  const objectType = bytes[offset];
  offset += 13; // objectTypeIndication, stream type, buffer size, max and average bitrates
  if (objectType !== 0x40) return 'other';
  if (descriptor(0x05) === null) return 'aac';
  const audioObjectType = (bytes[offset] ?? 0) >> 3;
  return audioObjectType === 2 ? 'aac-lc' : 'aac';
}

// ── MP3 ────────────────────────────────────────────────────────────────────────

const MPEG1_LAYER3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] as const;
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000] as const;
const SAMPLES_PER_FRAME = 1152;

export function mp3Info(bytes: Uint8Array): Mp3Info {
  const view = viewOf(bytes);
  const unknown: Mp3Info = { kind: 'mp3', seconds: null, mpeg1Layer3: false, frameKbps: null, vbr: false };
  const start = id3v2Length(bytes);
  const frame = findFrame(bytes, start);
  if (frame < 0) return unknown;
  const header = view.getUint32(frame);
  const version = (header >> 19) & 0b11;
  const layer = (header >> 17) & 0b11;
  const kbps = MPEG1_LAYER3_KBPS[(header >> 12) & 0b1111];
  const sampleRate = MPEG1_SAMPLE_RATES[(header >> 10) & 0b11];
  if (version !== 0b11 || layer !== 0b01 || !kbps || !sampleRate) return unknown;

  const mono = ((header >> 6) & 0b11) === 0b11;
  const xing = frame + 4 + (mono ? 17 : 32);
  const tag = fourCc(bytes, xing);
  if ((tag === 'Xing' || tag === 'Info') && xing + 12 <= bytes.length && view.getUint32(xing + 4) & 0x1) {
    const frames = view.getUint32(xing + 8);
    return {
      kind: 'mp3',
      seconds: (frames * SAMPLES_PER_FRAME) / sampleRate,
      mpeg1Layer3: true,
      frameKbps: kbps,
      vbr: tag === 'Xing',
    };
  }
  const vbri = frame + 4 + 32;
  if (fourCc(bytes, vbri) === 'VBRI' && vbri + 18 <= bytes.length) {
    const frames = view.getUint32(vbri + 14);
    return {
      kind: 'mp3',
      seconds: (frames * SAMPLES_PER_FRAME) / sampleRate,
      mpeg1Layer3: true,
      frameKbps: kbps,
      vbr: true,
    };
  }
  const id3v1 = bytes.length >= 128 && fourCc(bytes, bytes.length - 128).startsWith('TAG') ? 128 : 0;
  const audioBytes = bytes.length - frame - id3v1;
  return { kind: 'mp3', seconds: (audioBytes * 8) / (kbps * 1000), mpeg1Layer3: true, frameKbps: kbps, vbr: false };
}

/** Bytes taken by a leading ID3v2 tag (header, syncsafe size and optional footer), or 0. */
function id3v2Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = ((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0);
  const footer = (bytes[5] ?? 0) & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** Offset of the first 11-bit frame sync at or after `from`, or −1. */
function findFrame(bytes: Uint8Array, from: number): number {
  for (let offset = from; offset + 4 <= bytes.length; offset++) {
    if (bytes[offset] === 0xff && ((bytes[offset + 1] ?? 0) & 0xe0) === 0xe0) return offset;
  }
  return -1;
}

// ── Bytes ──────────────────────────────────────────────────────────────────────

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function fourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}
