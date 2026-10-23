import { type Art, vertical } from './art';
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
    { d: 'M9 4h12.5l6 6v21H9z', fill: 'rgba(0, 0, 0, 0.22)' },
    { d: 'M7.5 2.5h13l6 6v21h-19z', fill: vertical(32, '#ffffff', '#e6ebf2'), stroke: OUTLINE },
    {
      d: 'M20.5 2.5v6h6z',
      fill: {
        x1: 20.5,
        y1: 2.5,
        x2: 26.5,
        y2: 8.5,
        stops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#c9d1dc' },
        ],
      },
      stroke: OUTLINE,
    },
    { d: 'M10.5 6h7v1h-7zM10.5 9h8v1h-8zM10.5 12h13v1h-13zM10.5 15h13v1h-13zM10.5 28h11v.8h-11z', fill: '#b6bfcb' },
    {
      d: 'M4.5 18.5h17a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z',
      fill: {
        x1: 0,
        y1: 18.5,
        x2: 0,
        y2: 26.5,
        stops: [
          { offset: 0, color: '#f0503f' },
          { offset: 1, color: '#b3140c' },
        ],
      },
      stroke: '#8a0f09',
      width: 0.8,
    },
    { d: 'M4.6 19.3h16.8v1.4H4.6z', fill: 'rgba(255, 255, 255, 0.24)' },
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
    { d: 'M4.5 9h8.2l2.3 2.5h14.5V29h-25z', fill: 'rgba(0, 0, 0, 0.2)' },
    {
      d: 'M3.5 7.5h8.2l2.3 2.5h14.5a1 1 0 0 1 1 1v15.5h-26z',
      fill: vertical(32, '#f1c75a', '#c48f22'),
      stroke: '#946b18',
    },
    { d: 'M6 9.5h19.5v7H6z', fill: '#ffffff', stroke: '#b9b4a6', width: 0.6 },
    { d: 'M8 11.5h12v.8H8zM8 13.5h9v.8H8z', fill: '#c9ccd2' },
    {
      d: 'M2.5 13.5h27l-1.6 14H4.1z',
      fill: {
        x1: 0,
        y1: 13.5,
        x2: 0,
        y2: 27.5,
        stops: [
          { offset: 0, color: '#ffeaa8' },
          { offset: 1, color: '#efc152' },
        ],
      },
      stroke: '#a3781f',
    },
    { d: 'M3.5 14.5h25.1l-.12 1.1H3.62z', fill: 'rgba(255, 255, 255, 0.6)' },
  ],
};

/** A little beige television showing colour bars: a nod to the arcade on the TV across the room. */
const ARCADE: Art = {
  size: 32,
  parts: [
    { d: 'M6 7h22.5a2 2 0 0 1 2 2v14.5a2 2 0 0 1-2 2H6z', fill: 'rgba(0, 0, 0, 0.18)' },
    {
      d: 'M5 5.5h22a2.5 2.5 0 0 1 2.5 2.5v13.5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5V8A2.5 2.5 0 0 1 5 5.5z',
      fill: vertical(32, '#f6eedb', '#c9ba93'),
      stroke: '#7f7456',
    },
    {
      d: 'M7 7.5h18a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V9A1.5 1.5 0 0 1 7 7.5z',
      fill: '#24252b',
    },
    { d: 'M7 9h2.6v10H7z', fill: '#e8e8e8' },
    { d: 'M9.6 9h2.6v10H9.6z', fill: '#f1d935' },
    { d: 'M12.2 9h2.6v10h-2.6z', fill: '#34cfe3' },
    { d: 'M14.8 9h2.6v10h-2.6z', fill: '#3fc74a' },
    { d: 'M17.4 9H20v10h-2.6z', fill: '#d24fce' },
    { d: 'M20 9h2.6v10H20z', fill: '#e2453a' },
    { d: 'M22.6 9H25v10h-2.4z', fill: '#3c56df' },
    { d: 'M7 16.6h18V19H7z', fill: 'rgba(16, 18, 40, 0.55)' },
    { d: 'M7.4 9h8.4l-3.4 4.2H7.4z', fill: 'rgba(255, 255, 255, 0.2)' },
    { d: 'M23.6 21.6h2.2v.9h-2.2z', fill: '#5fdc5a' },
    { d: 'M12 24h8l1.5 3h-11z', fill: vertical(32, '#dcd0b2', '#ad9f77'), stroke: '#7f7456', width: 0.8 },
    { d: 'M8.5 27h15a1 1 0 0 1 1 1v.6h-17V28a1 1 0 0 1 1-1z', fill: '#c4b690', stroke: '#7f7456', width: 0.8 },
  ],
};

/** The room's own wire wastebasket, with two balls of paper in it. */
const WASTEBASKET: Art = {
  size: 32,
  parts: [
    { d: 'M6.5 10.5a9.5 2.2 0 0 1 19 0z', fill: 'rgba(70, 80, 92, 0.45)', stroke: '#5b6874', width: 0.9 },
    { d: 'M10.4 10.2a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0z', fill: '#fbfbf6', stroke: '#9aa0a7', width: 0.7 },
    { d: 'M11.6 9.3l1.6 1.2 1.4-.9M12.8 11.8l1.5-.6', stroke: '#b9bec4', width: 0.6 },
    { d: 'M16.2 8.7a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0z', fill: '#f2efe2', stroke: '#9aa0a7', width: 0.7 },
    { d: 'M17.4 8.2l1.2.9 1.3-1.1', stroke: '#b9bec4', width: 0.6 },
    {
      d: 'M6.5 10.5h19l-2.2 18.5H8.7z',
      fill: {
        x1: 0,
        y1: 10.5,
        x2: 0,
        y2: 29,
        stops: [
          { offset: 0, color: 'rgba(176, 190, 204, 0.42)' },
          { offset: 1, color: 'rgba(112, 126, 142, 0.5)' },
        ],
      },
    },
    {
      d: 'M9.5 11.2l1.3 17.6M12.6 11.4l.7 17.5M16 11.5v17.4M19.4 11.4l-.7 17.5M22.5 11.2l-1.3 17.6M7 15h18M7.8 21.5h16.4',
      stroke: '#6c7a88',
      width: 0.7,
    },
    { d: 'M6.5 10.5l2.2 18.5h14.6l2.2-18.5', stroke: '#4c5966' },
    { d: 'M6.5 10.5a9.5 2.2 0 0 0 19 0', stroke: '#4c5966', width: 1.2 },
    { d: 'M8.7 29a7.3 1.2 0 0 0 14.6 0', stroke: '#4c5966', width: 0.9 },
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
    { d: 'M.9 8.4a7.4 7.4 0 1 0 14.8 0a7.4 7.4 0 1 0-14.8 0z', fill: 'rgba(0, 40, 0, 0.35)' },
    { d: 'M.6 8a7.4 7.4 0 1 0 14.8 0a7.4 7.4 0 1 0-14.8 0z', fill: vertical(16, '#ffffff', '#d9e4ef') },
    { d: 'M1.9 8a6.1 6.1 0 1 0 12.2 0a6.1 6.1 0 1 0-12.2 0z', fill: vertical(16, '#6cc0ff', '#1d68d4') },
    { d: 'M9.3 5.6a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z', fill: '#ffd93b' },
    {
      d: 'M2.04 9.3Q7 5.9 13.96 9.3A6.1 6.1 0 0 1 2.04 9.3z',
      fill: {
        x1: 0,
        y1: 7.5,
        x2: 0,
        y2: 14,
        stops: [
          { offset: 0, color: '#9be654' },
          { offset: 1, color: '#2c8a1d' },
        ],
      },
    },
    { d: 'M3.3 6.3a4.7 3 0 0 1 9.4 0a4.7 1.5 0 0 1-9.4 0z', fill: 'rgba(255, 255, 255, 0.45)' },
    { d: 'M.6 8a7.4 7.4 0 1 0 14.8 0a7.4 7.4 0 1 0-14.8 0z', stroke: 'rgba(18, 70, 18, 0.55)', width: 0.6 },
  ],
};
