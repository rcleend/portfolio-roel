import { type CSSProperties, useEffect, useState } from 'react';
import { loadUiFonts } from './uiFonts';
import './LoadingScreen.css';

export interface LoadingScreenProps {
  /** 0–1. */
  readonly progress: number;
  readonly failed: boolean;
  /** Plays the exit (a fade) and then calls `onLeft`. */
  readonly leaving: boolean;
  onLeft(): void;
}

/**
 * The first thing a visitor sees, in the room UI's own voice (docs/ART-DIRECTION.md › The room's UI): the name
 * stacked RO over EL in Chewy, filling with white from the bottom as the room downloads, over one line in Nunito.
 * It shows only after a short delay and once its faces are in, so a fast (cached) load goes straight from a dark page
 * to the TV without a flash of loading UI, and the name never swaps faces in front of the visitor.
 */
export function LoadingScreen({ progress, failed, leaving, onLeft }: LoadingScreenProps) {
  const fontsReady = useFontsReady();
  const percent = Math.floor(clamp01(progress) * 100);
  return (
    <div
      className={leaving ? 'loading loading--leaving' : 'loading'}
      data-fonts={fontsReady ? 'ready' : 'waiting'}
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
        aria-valuenow={percent}
        aria-valuetext={failed ? 'Failed to load' : `${percent}%`}
      >
        <p className="loading__name" aria-hidden="true" style={{ '--progress': clamp01(progress) } as CSSProperties}>
          <span className="loading__ghost">
            <span>RO</span>
            <span>EL</span>
          </span>
          <span className="loading__fill">
            <span>RO</span>
            <span>EL</span>
          </span>
        </p>
        {failed ? (
          <p className="loading__line">
            The room would not load. <a href="#resume">Read the résumé instead</a>.
          </p>
        ) : (
          <p className="loading__line" aria-hidden="true">
            Tidying up my room…
          </p>
        )}
      </div>
    </div>
  );
}

function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void loadUiFonts().then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return ready;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
