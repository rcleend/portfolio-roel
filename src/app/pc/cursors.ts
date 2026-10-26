import type { Art } from './desktop/art';

/**
 * The screen's own pointer art: an original arrow and a busy arrow with a
 * small hourglass. The scripted cursor of the startup draws this art as DOM,
 * and the hardware cursor over the live screen uses it as an SVG data URI,
 * so the two arrows are the same drawing when one hands over to the other.
 */

const ARROW = 'M.5.5v16l4-3.7 2.7 5.7 2.4-1.1-2.6-5.6h4.6z';

export const ARROW_ART: Art = {
  size: 32,
  parts: [{ d: ARROW, fill: '#ffffff', stroke: '#000000' }],
};

export const BUSY_ART: Art = {
  size: 32,
  parts: [
    { d: ARROW, fill: '#ffffff', stroke: '#000000' },
    {
      d: 'M13.5 8.5h7v1.2h-.8v1.1c0 2.1-2.4 2.9-2.4 4.2s2.4 2.1 2.4 4.2v1.1h.8v1.2h-7v-1.2h.8v-1.1c0-2.1 2.4-2.9 2.4-4.2s-2.4-2.1-2.4-4.2V9.7h-.8z',
      fill: '#ffffff',
      stroke: '#000000',
      width: 0.9,
    },
    { d: 'M15.4 10.6h3.2c0 1.3-1.6 2-1.6 3 0-1-1.6-1.7-1.6-3z', fill: '#d99a2b' },
    { d: 'M15.2 19.6c0-1.5 1.8-2 1.8-3.2 0 1.2 1.8 1.7 1.8 3.2z', fill: '#d99a2b' },
  ],
};

/** The scripted cursor's box in layout px: the arrow's own extent. */
export const CURSOR_WIDTH = 12;
export const CURSOR_HEIGHT = 19;

/** A CSS `cursor` value drawing `art` with its hotspot at the arrow's tip. */
export function cursorValue(art: Art, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svgMarkup(art))}") 0 0, ${fallback}`;
}

function svgMarkup(art: Art): string {
  const paths = art.parts
    .map(
      (part) =>
        `<path d="${part.d}" fill="${typeof part.fill === 'string' ? part.fill : 'none'}"${
          part.stroke ? ` stroke="${part.stroke}" stroke-width="${part.width ?? 1}"` : ''
        }/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${art.size}" height="${art.size}" viewBox="0 0 ${art.size} ${art.size}">${paths}</svg>`;
}
