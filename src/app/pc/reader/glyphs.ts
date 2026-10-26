import { type Art, vertical } from '../desktop/art';

/**
 * The reader's 16 × 16 toolbar and status-bar glyphs: original drawings in
 * the period's softly shaded style.
 */

const INK = '#2b3a55';
const BLUE = '#2f66d0';

const glyph = (...parts: Art['parts']): Art => ({ size: 16, parts });

export const SAVE_GLYPH = glyph(
  { d: 'M1.5 1.5h11l2 2v11h-13z', fill: vertical(16, '#5b83d6', '#2c4f9e'), stroke: '#1c3266' },
  { d: 'M4 1.5h7.5v4.5H4z', fill: '#e8eef8' },
  { d: 'M9 2.3h1.6v2.9H9z', fill: '#2c4f9e' },
  { d: 'M3.5 8.5h9v6h-9z', fill: '#ffffff' },
  { d: 'M5 10h6v.8H5zM5 12h6v.8H5z', fill: '#9fb2d6' },
);

export const PRINT_GLYPH = glyph(
  { d: 'M4.5 1.5h7v4h-7z', fill: '#ffffff', stroke: '#6d6d68' },
  { d: 'M1.5 5.5h13v6h-13z', fill: vertical(16, '#e4e3dc', '#a9a8a0'), stroke: '#5d5d58' },
  { d: 'M4.5 9.5h7v5h-7z', fill: '#ffffff', stroke: '#6d6d68' },
  { d: 'M6 11.5h4v.8H6z', fill: '#a3a39b' },
  { d: 'M11.8 7h1.4v1.2h-1.4z', fill: '#45b548' },
);

export const EMAIL_GLYPH = glyph(
  { d: 'M1.5 3.5h13v9h-13z', fill: vertical(16, '#ffffff', '#e4e8ef'), stroke: '#6f7787' },
  { d: 'M1.5 3.5L8 9l6.5-5.5', stroke: '#6f7787' },
  { d: 'M1.5 12.5l4.8-4.6M14.5 12.5L9.7 7.9', stroke: '#a3aab8' },
);

export const HAND_GLYPH = glyph({
  d: 'M5.2 14.5L2.6 10.6c-.6-.9.5-1.8 1.3-1.1L5 10.5V3.6c0-.9 1.4-.9 1.4 0v4V2.4c0-.9 1.4-.9 1.4 0v5.1V2.9c0-.9 1.4-.9 1.4 0v4.9V4c0-.9 1.4-.9 1.4 0v6.5c0 1.9-.6 3-1.2 4z',
  fill: '#ffffff',
  stroke: INK,
  width: 0.9,
});

export const SELECT_GLYPH = glyph(
  { d: 'M4.5 2.5h1.2c.6 0 .9.3.9.9v9.2c0 .6.3.9.9.9h1.2M4.5 13.5h1.2c.6 0 .9-.3.9-.9', stroke: INK },
  { d: 'M9.5 4.5h5M9.5 7.5h5M9.5 10.5h3', stroke: '#8a94a8' },
);

const MAGNIFIER = [
  { d: 'M10.2 10.2l4 4', stroke: '#6b4a24', width: 2.6 },
  {
    d: 'M1.8 6.6a4.8 4.8 0 1 0 9.6 0a4.8 4.8 0 1 0-9.6 0z',
    fill: 'rgba(214, 232, 255, 0.85)',
    stroke: INK,
    width: 1.2,
  },
] as const;

export const ZOOM_OUT_GLYPH = glyph(...MAGNIFIER, { d: 'M4.2 6.6h4.8', stroke: BLUE, width: 1.6 });

export const ZOOM_IN_GLYPH = glyph(...MAGNIFIER, { d: 'M4.2 6.6h4.8M6.6 4.2v4.8', stroke: BLUE, width: 1.6 });

export const FIT_WIDTH_GLYPH = glyph(
  { d: 'M3.5 1.5h9v13h-9z', fill: '#ffffff', stroke: '#6f7787' },
  { d: 'M5.5 4h5M5.5 6h5M5.5 12h5', stroke: '#c0c6d2' },
  { d: 'M1 9h14', stroke: BLUE, width: 1.4 },
  { d: 'M3.2 6.8L1 9l2.2 2.2M12.8 6.8L15 9l-2.2 2.2', stroke: BLUE, width: 1.4 },
);

export const REFLOW_GLYPH = glyph(
  { d: 'M2.5 1.5h11v13h-11z', fill: '#ffffff', stroke: '#6f7787' },
  { d: 'M4.5 4h7M4.5 6.5h7M4.5 9h4', stroke: '#7d889c' },
  { d: 'M11.5 9v2.5H7.5', stroke: BLUE, width: 1.2 },
  { d: 'M9 10l-1.5 1.5L9 13', stroke: BLUE, width: 1.2 },
);

const TRIANGLE_FILL = vertical(16, '#4f8be0', '#1f55b4');
const TRIANGLE_STROKE = '#173f86';

export const FIRST_PAGE_GLYPH = glyph(
  { d: 'M3.5 3.5v9', stroke: TRIANGLE_STROKE, width: 1.6 },
  { d: 'M12.5 3.5v9L5 8z', fill: TRIANGLE_FILL, stroke: TRIANGLE_STROKE, width: 0.8 },
);

export const PREVIOUS_PAGE_GLYPH = glyph({
  d: 'M11 3.5v9L3.5 8z',
  fill: TRIANGLE_FILL,
  stroke: TRIANGLE_STROKE,
  width: 0.8,
});

export const NEXT_PAGE_GLYPH = glyph({
  d: 'M5 3.5v9L12.5 8z',
  fill: TRIANGLE_FILL,
  stroke: TRIANGLE_STROKE,
  width: 0.8,
});

export const LAST_PAGE_GLYPH = glyph(
  { d: 'M12.5 3.5v9', stroke: TRIANGLE_STROKE, width: 1.6 },
  { d: 'M3.5 3.5v9L11 8z', fill: TRIANGLE_FILL, stroke: TRIANGLE_STROKE, width: 0.8 },
);

export const SINGLE_PAGE_GLYPH = glyph({ d: 'M4.5 2.5h7v11h-7z', fill: '#ffffff', stroke: '#6f7787' });

export const CONTINUOUS_GLYPH = glyph({ d: 'M4.5 1.5h7v6h-7zM4.5 8.5h7v6h-7z', fill: '#ffffff', stroke: '#6f7787' });

export const FACING_GLYPH = glyph({ d: 'M1.5 3.5h6v9h-6zM8.5 3.5h6v9h-6z', fill: '#ffffff', stroke: '#6f7787' });
