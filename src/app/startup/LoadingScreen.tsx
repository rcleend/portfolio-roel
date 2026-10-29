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
 * The first thing a visitor sees, in the room UI's own voice (docs/ART-DIRECTION.md › The room's UI): "Loading..." in
 * white Chewy over a rounded white bar that fills with the real download, and nothing else. It shows only after a
 * short delay and once Chewy is in, so a fast (cached) load goes straight from a dark page to the TV without a flash
 * of loading UI, and the word never swaps faces in front of the visitor.
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
        <p className="loading__word" aria-hidden="true">
          Loading...
        </p>
        <span className="loading__bar" aria-hidden="true">
          <span className="loading__fill" style={{ '--progress': clamp01(progress) } as CSSProperties} />
        </span>
        {failed ? (
          <p className="loading__failed">
            The room would not load. <a href="#resume">Read the résumé instead</a>.
          </p>
        ) : null}
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
