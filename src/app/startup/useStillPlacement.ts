import { useEffect, useState } from 'react';
import { COARSE_POINTER, useMediaQuery } from '../useMediaQuery';
import { placeStill, type StillPlacement } from './tvStills';

/** Where the startup still and its picture go on this viewport, kept up to date as it resizes. */
export function useStillPlacement(): StillPlacement {
  const touch = useMediaQuery(COARSE_POINTER);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = (): void => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return placeStill(viewport, touch);
}
