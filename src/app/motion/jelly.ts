/**
 * A button's glyph wobbling like jelly as it changes state (round seven, item 42): squashed one way, then the other,
 * then still. The radio's play key and the sound toggle share it, so they move as a pair. A Web Animation with no
 * fill, so nothing lingers once it is over; nothing at all under reduced motion.
 */
export function jelly(element: Element | null): void {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.animate?.(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.16, 0.84)', offset: 0.3 },
      { transform: 'scale(0.93, 1.07)', offset: 0.6 },
      { transform: 'scale(1.02, 0.98)', offset: 0.82 },
      { transform: 'scale(1)' },
    ],
    { duration: 460, easing: 'ease-out' },
  );
}
