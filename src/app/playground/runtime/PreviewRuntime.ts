import { createContext, use } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import type { GameResources } from '@/game/resources';
import type { PreviewLoop } from './PreviewLoop';

/** What every live preview on the page shares, made once when the page loads. */
export interface PreviewRuntime {
  /** Fonts, sprites and level art, loaded once for every preview. */
  readonly resources: GameResources;
  readonly loop: PreviewLoop;
  /** The game's synthesiser, only ever heard through the focused view. */
  readonly audio: GameAudio;
}

export const PreviewRuntimeContext = createContext<PreviewRuntime | null>(null);

export function usePreviewRuntime(): PreviewRuntime {
  const runtime = use(PreviewRuntimeContext);
  if (!runtime) throw new Error('A live preview needs a PreviewRuntimeContext above it');
  return runtime;
}
