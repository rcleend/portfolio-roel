import { useEffect, useState } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import { type PreviewSpec, ScenePreview } from '@/game/preview';
import type { PreviewLayer } from './PreviewLoop';
import { usePreviewRuntime } from './PreviewRuntime';

export interface LivePreviewOptions {
  readonly reducedMotion: boolean;
  readonly layer: PreviewLayer;
  /** Plays the scene's sound; give it to one preview at a time. */
  readonly audio?: GameAudio;
}

/**
 * Shows `spec` live in `element`: the real scene on the page's shared
 * resources, its canvas put first in `element` and driven by the shared
 * loop. Any change of spec or settings replaces the preview with a new one
 * at the same frame. Returns what went wrong if the scene threw, so the
 * screen can say so while the rest of the page plays on.
 */
export function useLivePreview(element: HTMLElement | null, spec: PreviewSpec, options: LivePreviewOptions): unknown {
  const { resources, loop } = usePreviewRuntime();
  const { reducedMotion, layer, audio } = options;
  const [failure, setFailure] = useState<{ readonly error: unknown } | null>(null);

  useEffect(() => {
    if (!element) return;
    const fail = (error: unknown): void => {
      console.error(`The ${spec.scene} preview of ${JSON.stringify(spec.params)} failed`, error);
      setFailure({ error });
    };
    let preview: ScenePreview;
    try {
      preview = new ScenePreview({ resources, spec, reducedMotion, audio });
    } catch (error) {
      fail(error);
      return;
    }
    setFailure(null);
    // The variant's name and line say what the canvas shows.
    preview.canvas.setAttribute('aria-hidden', 'true');
    element.prepend(preview.canvas);
    const live = loop.add(preview, element, layer, fail);
    return () => {
      live.remove();
      preview.canvas.remove();
      preview.dispose();
    };
  }, [element, resources, loop, spec, reducedMotion, layer, audio]);

  return failure?.error ?? null;
}
