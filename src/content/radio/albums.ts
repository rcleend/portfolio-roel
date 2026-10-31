import type { Album } from './types';

/**
 * The CD player's shelf, in display order (docs/RADIO.md › Your own albums). Each album's
 * files live in src/content/radio/albums/<id>/. `pnpm verify:radio` checks every entry
 * against its files and prints the right `seconds` when one is off.
 *
 * Roel's own songs, one per CD, re-encoded from the masters to ~128 kb/s AAC (streamed,
 * fetched only once their CD is chosen). The discs keep the placeholders' seeded art
 * (scripts/radio/covers.ts).
 */
export const ALBUMS: readonly Album[] = [
  {
    id: 'its-all-in-your-head',
    title: "It's all in your head",
    artist: 'Roel Leenders ft. Bram Reker',
    year: 2016,
    cover: 'cover.webp',
    disc: 'disc.webp',
    tracks: [{ title: "It's all in your head", file: 'its-all-in-your-head.m4a', seconds: 229.18 }],
  },
  {
    id: 'gekke-synth-lange-frans',
    title: 'gekkeSynthLangeFrans',
    artist: 'Roel Leenders',
    year: 2018,
    cover: 'cover.webp',
    disc: 'disc.webp',
    tracks: [{ title: 'gekkeSynthLangeFrans', file: 'gekke-synth-lange-frans.m4a', seconds: 80.06 }],
  },
  {
    id: 'drop-the-bombs',
    title: 'DROP THE BOMBS',
    artist: 'Roel Leenders',
    year: 2025,
    cover: 'cover.webp',
    disc: 'disc.webp',
    tracks: [{ title: 'DROP THE BOMBS', file: 'drop-the-bombs.m4a', seconds: 280.06 }],
  },
  {
    id: 'midnight-mirage',
    title: 'Midnight Mirage',
    artist: 'Roel Leenders',
    year: 2025,
    cover: 'cover.webp',
    disc: 'disc.webp',
    tracks: [{ title: 'Midnight Mirage', file: 'midnight-mirage.m4a', seconds: 231.87 }],
  },
  {
    id: 'async-002',
    title: 'Async_002',
    artist: 'Roel Leenders',
    year: 2026,
    cover: 'cover.webp',
    disc: 'disc.webp',
    tracks: [{ title: 'Async_002', file: 'async-002.m4a', seconds: 122.94 }],
  },
];
