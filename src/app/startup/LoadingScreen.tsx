import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { REDUCED_MOTION, useMediaQuery } from '../useMediaQuery';
import { LOADING_ART_HEIGHT, LOADING_ART_WIDTH, LoadingArt } from './loadingArt';
import { percentLabel } from './loadingBar';
import './LoadingScreen.css';

export interface LoadingScreenProps {
  /** 0–1. */
  readonly progress: number;
  readonly failed: boolean;
  /** Plays the exit (a stepped fade) and then calls `onLeft`. */
  readonly leaving: boolean;
  onLeft(): void;
}

/**
 * Full-page loading screen in the attic's night palette. The pixel vignette
 * is a native canvas scaled by whole numbers; everything else is plain DOM.
 * It only becomes visible after a short delay, so a fast (cached) load goes
 * straight from a dark page to the TV without a flash of loading UI.
 */
export function LoadingScreen({ progress, failed, leaving, onLeft }: LoadingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const scale = useArtScale();

  const artRef = useRef<LoadingArt | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const art = new LoadingArt(canvas);
    artRef.current = art;
    // Reduced motion: a still frame, redrawn by the progress effect below.
    if (reducedMotion) return;
    let handle = 0;
    const start = performance.now();
    const frame = (now: number): void => {
      // rAF timestamps can predate performance.now() taken just before scheduling.
      art.draw(Math.max(0, now - start) / 1000, progressRef.current, failed);
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [failed, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) artRef.current?.draw(0, progress, failed);
  }, [progress, failed, reducedMotion]);

  const style = {
    '--art-width': `${LOADING_ART_WIDTH * scale}px`,
    '--art-height': `${LOADING_ART_HEIGHT * scale}px`,
  } as CSSProperties;

  return (
    <div
      className={leaving ? 'loading loading--leaving' : 'loading'}
      style={style}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onLeft();
      }}
    >
      <div
        className="loading__content"
        role="progressbar"
        aria-label="Loading the arcade"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(progress * 100)}
        aria-valuetext={failed ? 'Failed to load' : percentLabel(progress)}
      >
        <canvas ref={canvasRef} className="loading__art" width={LOADING_ART_WIDTH} height={LOADING_ART_HEIGHT} />
        {failed ? (
          <p className="loading__caption">
            The game could not load. <a href="#resume">Read the résumé instead</a>.
          </p>
        ) : (
          <p className="loading__caption" aria-hidden="true">
            Roel Leenders <span className="loading__dot">·</span> Product Engineer
          </p>
        )}
      </div>
    </div>
  );
}

/** Largest whole zoom that keeps the vignette comfortably inside the viewport (1–3). */
function artScale(): number {
  const fit = Math.min((window.innerWidth * 0.9) / LOADING_ART_WIDTH, (window.innerHeight * 0.6) / LOADING_ART_HEIGHT);
  return Math.max(1, Math.min(3, Math.floor(fit)));
}

function useArtScale(): number {
  const [scale, setScale] = useState(artScale);
  useEffect(() => {
    const resize = (): void => setScale(artScale());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return scale;
}
