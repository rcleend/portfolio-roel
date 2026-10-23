import type { Album } from './types';

/**
 * The CD player's shelf, in display order (docs/RADIO.md › Your own albums). Each album's
 * files live in src/content/radio/albums/<id>/. `pnpm verify:radio` checks every entry
 * against its files and prints the right `seconds` when one is off.
 *
 * These five are placeholders: original music composed for this site in the game's own
 * tracker (scripts/radio/songs) and seeded generative art (scripts/radio/covers.ts).
 */
export const ALBUMS: readonly Album[] = [
  {
    id: 'night-shift',
    title: 'Night Shift',
    artist: 'Studio Attic',
    year: 2026,
    cover: 'cover.webp',
    disc: 'disc.webp',
    placeholder: true,
    tracks: [
      { title: 'Kettle On', file: '01-kettle-on.m4a', seconds: 51.94 },
      { title: 'Window Seat', file: '02-window-seat.m4a', seconds: 46.18 },
    ],
  },
  {
    id: 'insert-coin',
    title: 'Insert Coin',
    artist: '8-Bit Lodgers',
    year: 2026,
    cover: 'cover.webp',
    disc: 'disc.webp',
    placeholder: true,
    tracks: [
      { title: 'Attract Mode', file: '01-attract-mode.m4a', seconds: 42.89 },
      { title: 'High Score Dreams', file: '02-high-score-dreams.m4a', seconds: 45.19 },
      { title: 'Continue?', file: '03-continue.m4a', seconds: 40.7 },
    ],
  },
  {
    id: 'low-tide',
    title: 'Low Tide',
    artist: 'Harbour Lights',
    year: 2026,
    cover: 'cover.webp',
    disc: 'disc.webp',
    placeholder: true,
    tracks: [
      { title: 'Slow Water', file: '01-slow-water.m4a', seconds: 55.1 },
      { title: 'Lighthouse', file: '02-lighthouse.m4a', seconds: 51.46 },
    ],
  },
  {
    id: 'solar-drive',
    title: 'Solar Drive',
    artist: 'Neon Rafters',
    year: 2026,
    cover: 'cover.webp',
    disc: 'disc.webp',
    placeholder: true,
    tracks: [
      { title: 'Overdrive', file: '01-overdrive.m4a', seconds: 48.39 },
      { title: 'Last Exit', file: '02-last-exit.m4a', seconds: 51.18 },
    ],
  },
  {
    id: 'sunday-roast',
    title: 'Sunday Roast',
    artist: 'Trio Placeholder',
    year: 2026,
    cover: 'cover.webp',
    disc: 'disc.webp',
    placeholder: true,
    tracks: [
      { title: 'Coffee Break', file: '01-coffee-break.m4a', seconds: 45.02 },
      { title: 'Encore', file: '02-encore.m4a', seconds: 41.52 },
    ],
  },
];
