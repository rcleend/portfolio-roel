import type { GradientStop } from './lunaTokens';

/** `linear-gradient(<direction>, <stops>)` from a token's stop array, for the DOM desktop's inline styles. */
export function cssGradient(direction: string, stops: readonly GradientStop[]): string {
  return `linear-gradient(${direction}, ${stops.map((stop) => `${stop.color} ${round(stop.offset * 100)}%`).join(', ')})`;
}

function round(percent: number): number {
  return Math.round(percent * 1000) / 1000;
}
