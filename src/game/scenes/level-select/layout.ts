import type { Rect } from '@/engine/math/Rect';

/**
 * Screen geometry for the mission select at 320 × 240, top to bottom:
 * header, three postcards, the career route, the briefing panel.
 */
export const HEADER_Y = 3;

const CARD = { y: 26, w: 98, h: 82, gap: 4 } as const;
const CARDS_LEFT = Math.floor((320 - (CARD.w * 3 + CARD.gap * 2)) / 2);

export function cardRect(index: number): Rect {
  return { x: CARDS_LEFT + index * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h };
}

/** The picture area inside a postcard frame. */
export function previewRect(card: Rect): Rect {
  return { x: card.x + 5, y: card.y + 5, w: card.w - 10, h: 48 };
}

/** Baseline of the route strip under the cards. */
export const ROUTE_Y = 116;

export const PANEL: Rect = { x: 6, y: 126, w: 308, h: 110 };

/** How far the focused postcard rises out of the row. */
export const FOCUS_LIFT = 3;
