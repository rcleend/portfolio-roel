import { type CSSProperties, useState } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '@/game/createGame';
import type { Show } from '../boards/subject';
import type { PreviewLayer } from '../runtime/PreviewLoop';
import { useLivePreview } from '../runtime/useLivePreview';
// The CRT look is the flat host's own scanlines and glass, so the playground shows what the fallback TV shows.
import '../../hosts/FlatHost.css';

interface LiveScreenProps {
  readonly show: Show;
  /** Whole CSS pixels per game pixel. */
  readonly zoom: number;
  readonly crt: boolean;
  readonly reducedMotion: boolean;
  readonly layer: PreviewLayer;
  /** Plays the scene's sound; give it to one screen at a time. */
  readonly audio?: GameAudio;
}

/** A live scene, in its looks, at a whole-number zoom: every game pixel a sharp square. */
export function LiveScreen({ show, zoom, crt, reducedMotion, layer, audio }: LiveScreenProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const failure = useLivePreview(element, show, { reducedMotion, layer, audio });
  const style = {
    width: SCREEN_WIDTH * zoom,
    height: SCREEN_HEIGHT * zoom,
    // One scanline per game row, its dark band a whole number of CSS pixels, as FlatHost.tsx draws them.
    '--row': `${zoom}px`,
    '--row-dark': `${Math.max(1, Math.round(zoom / 3))}px`,
  } as CSSProperties;
  return (
    <div ref={setElement} className={crt ? 'screen screen--crt' : 'screen'} style={style}>
      {crt ? (
        <>
          <div className="tv__scanlines" aria-hidden="true" />
          <div className="tv__glass" aria-hidden="true" />
        </>
      ) : null}
      {failure ? (
        <p className="screen__failure" role="alert">
          This preview crashed: {failure instanceof Error ? failure.message : String(failure)}
        </p>
      ) : null}
    </div>
  );
}
