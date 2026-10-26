import { type Art, vertical } from '../desktop/art';

/**
 * The document reader's own marks: an original white folded sheet, never a
 * stylised letter or swirl. 16 px for the title bar and the taskbar button
 * (on a red rounded square), 64 px for the splash (on its red background).
 */
export const READER_MARK: Art = {
  size: 16,
  parts: [
    {
      d: 'M2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11A1.5 1.5 0 0 1 2.5 1z',
      fill: vertical(16, '#f2584a', '#b3150d'),
      stroke: '#7c0d08',
      width: 0.6,
    },
    { d: 'M2.6 1.8h10.8v4.2H2.6z', fill: 'rgba(255, 255, 255, 0.18)' },
    { d: 'M4.8 3.2h4.6l2.4 2.4v7.2h-7z', fill: '#ffffff' },
    { d: 'M9.4 3.2v2.4h2.4z', fill: '#f3c4bf' },
    { d: 'M6.2 7.4h4.2v.8H6.2zM6.2 9.2h4.2v.8H6.2zM6.2 11h2.8v.8H6.2z', fill: '#e2a39c' },
  ],
};

export const SHEET_MARK: Art = {
  size: 64,
  parts: [
    { d: 'M16 8h25l13 13v39H16z', fill: 'rgba(60, 0, 0, 0.3)' },
    { d: 'M13 5h25l13 13v39H13z', fill: vertical(64, '#ffffff', '#f4e3e0') },
    { d: 'M38 5v13h13z', fill: '#f0c3bd' },
    { d: 'M38 5v13h13', stroke: 'rgba(120, 20, 12, 0.35)', width: 1 },
    { d: 'M20 25h22v2H20zM20 31h24v2H20zM20 37h24v2H20zM20 43h16v2H20z', fill: '#efc9c4' },
  ],
};
