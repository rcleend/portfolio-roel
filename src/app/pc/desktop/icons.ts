import { type Art, bands, circle, linear, roundRect, vertical } from './art';
import type { DesktopIconId } from './desktopLayout';

/**
 * The desktop's icons and the start button's mark: original drawings in the
 * spirit of early-2000s desktop art (glossy, softly shaded, outlined), not
 * traced from any product. 32 × 32 view boxes, the mark 16 × 16.
 */

const OUTLINE = '#7d8794';

/** The résumé: a white folded sheet with grey text lines and a red "PDF" band (letters drawn, not typed). */
const CV: Art = {
  size: 32,
  parts: [
    { d: 'M7.5 2.5h13l6 6v21h-19z', fill: vertical(32, '#ffffff', '#e6ebf2'), stroke: OUTLINE, shadow: true },
    {
      d: 'M20.5 2.5v6h6z',
      fill: linear(20.5, 2.5, 26.5, 8.5, '#ffffff', '#c9d1dc'),
      stroke: OUTLINE,
    },
    { d: 'M10.5 6h7v1h-7zM10.5 9h8v1h-8zM10.5 12h13v1h-13zM10.5 15h13v1h-13zM10.5 28h11v.8h-11z', fill: '#b6bfcb' },
    {
      d: roundRect(3.5, 18.5, 19, 8, 1),
      fill: linear(0, 18.5, 0, 26.5, '#f0503f', '#b3140c'),
      stroke: '#8a0f09',
      width: 0.8,
    },
    {
      d:
        'M5.8 19.75h2.6a1.85 1.85 0 0 1 0 3.7H7.3v1.8H5.8zM7.3 20.95v1.3h1.1a.65 .65 0 0 0 0-1.3z' +
        'M10.9 19.75h1.9a2.75 2.75 0 0 1 0 5.5h-1.9zM12.4 20.95v3.1h.4a1.55 1.55 0 0 0 0-3.1z' +
        'M16.4 19.75H20V21h-2.1v.95h1.8v1.2h-1.8v2.1h-1.5z',
      fill: '#ffffff',
      evenOdd: true,
    },
  ],
};

/** A manila folder with a sheet peeking out. */
const PROJECTS: Art = {
  size: 32,
  parts: [
    {
      d: 'M3.5 7.5h8.2l2.3 2.5h14.5a1 1 0 0 1 1 1v15.5h-26z',
      fill: vertical(32, '#f1c75a', '#c48f22'),
      stroke: '#946b18',
      shadow: true,
    },
    { d: 'M6 9.5h19.5v7H6z', fill: '#ffffff', stroke: '#b9b4a6', width: 0.6 },
    { d: 'M8 11.5h12v.8H8z', fill: '#c9ccd2' },
    {
      d: 'M2.5 13.5h27l-1.6 14H4.1z',
      fill: linear(0, 13.5, 0, 27.5, '#ffeaa8', '#efc152'),
      stroke: '#a3781f',
    },
    { d: 'M3.5 14.5h25.1l-.12 1.1H3.62z', fill: 'rgba(255, 255, 255, 0.6)' },
  ],
};

/** A little beige television showing colour bars: a nod to the arcade on the TV across the room. */
const ARCADE: Art = {
  size: 32,
  parts: [
    {
      d: roundRect(2.5, 5.5, 27, 18.5, 2.5),
      fill: vertical(32, '#f6eedb', '#c9ba93'),
      stroke: '#7f7456',
      shadow: true,
    },
    {
      d: roundRect(5.5, 7.5, 21, 13, 1.5),
      fill: '#24252b',
    },
    {
      d: 'M7 9h18v10H7z',
      fill: bands(7, 25, '#e8e8e8', '#f1d935', '#34cfe3', '#3fc74a', '#d24fce', '#e2453a', '#3c56df'),
    },
    { d: 'M7.4 9h8.4l-3.4 4.2H7.4z', fill: 'rgba(255, 255, 255, 0.2)' },
    { d: 'M23.6 21.6h2.2v.9h-2.2z', fill: '#5fdc5a' },
    {
      d: 'M12 24h8l1.5 3h2a1 1 0 0 1 1 1v.6h-17V28a1 1 0 0 1 1-1h2z',
      fill: vertical(32, '#e0d4b6', '#a89a72'),
      stroke: '#7f7456',
      width: 0.8,
    },
  ],
};

/** The room's own wire wastebasket, with two balls of paper in it. */
const WASTEBASKET: Art = {
  size: 32,
  parts: [
    { d: 'M6.5 10.5a9.5 2.2 0 0 1 19 0z', fill: 'rgba(70, 80, 92, 0.45)', stroke: '#5b6874', width: 0.9 },
    { d: circle(13.6, 10.2, 3.2), fill: '#fbfbf6', stroke: '#9aa0a7', width: 0.7 },
    { d: circle(19, 8.7, 2.8), fill: '#f2efe2', stroke: '#9aa0a7', width: 0.7 },
    {
      d: 'M6.5 10.5h19l-2.2 18.5H8.7z',
      fill: linear(0, 10.5, 0, 29, 'rgba(176, 190, 204, 0.42)', 'rgba(112, 126, 142, 0.5)'),
    },
    {
      d: 'M9.5 11.2l1.3 17.6M12.6 11.4l.7 17.5M16 11.5v17.4M19.4 11.4l-.7 17.5M22.5 11.2l-1.3 17.6M7 15h18M7.8 21.5h16.4',
      stroke: '#6c7a88',
      width: 0.7,
    },
    {
      d: 'M6.5 10.5l2.2 18.5h14.6l2.2-18.5M6.5 10.5a9.5 2.2 0 0 0 19 0M8.7 29a7.3 1.2 0 0 0 14.6 0',
      stroke: '#4c5966',
    },
  ],
};

export const DESKTOP_ICON_ART: Readonly<Record<DesktopIconId, Art>> = {
  cv: CV,
  projects: PROJECTS,
  arcade: ARCADE,
  wastebasket: WASTEBASKET,
};

/** The start button's mark: a white-rimmed glossy orb holding a yellow sun over a green hill. */
export const START_MARK: Art = {
  size: 16,
  parts: [
    { d: circle(8, 8, 7.4), fill: vertical(16, '#ffffff', '#d9e4ef'), stroke: 'rgba(18, 70, 18, 0.55)', width: 0.6 },
    { d: circle(8, 8, 6.1), fill: vertical(16, '#6cc0ff', '#1d68d4') },
    { d: circle(11.2, 5.6, 1.9), fill: '#ffd93b' },
    {
      d: 'M2.04 9.3Q7 5.9 13.96 9.3A6.1 6.1 0 0 1 2.04 9.3z',
      fill: linear(0, 7.5, 0, 14, '#9be654', '#2c8a1d'),
    },
    { d: 'M3.3 6.3a4.7 3 0 0 1 9.4 0a4.7 1.5 0 0 1-9.4 0z', fill: 'rgba(255, 255, 255, 0.45)' },
  ],
};
