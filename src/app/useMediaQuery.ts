import { useSyncExternalStore } from 'react';

/** Live `matchMedia` result, e.g. `(pointer: coarse)` or `(prefers-reduced-motion: reduce)`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
export const COARSE_POINTER = '(pointer: coarse)';
