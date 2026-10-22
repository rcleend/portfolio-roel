import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGameAudio } from '@/game/audio/createGameAudio';
import { loadGameResources } from '@/game/resources';
import { comparedPicker } from './boards/board';
import { PLAYGROUND_BOARDS } from './boards/catalog';
import { Playground } from './Playground';
import { PreviewLoop } from './runtime/PreviewLoop';
import { readUrlState } from './state/urlState';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './playground.css';

/** What the playground shows and its transport, for Playwright, as `window.__playground`. */
export interface PlaygroundHandle {
  /** The choices each board compares, by board id: one tile each. */
  readonly boards: Readonly<Record<string, readonly string[]>>;
  readonly loop: PreviewLoop;
}

declare global {
  interface Window {
    __playground?: PlaygroundHandle;
  }
}

/**
 * The playground (`/playground` on the dev server; docs/ARCHITECTURE.md ›
 * Development harness): every registered title lockup and backdrop, live
 * and side by side, to pick winners.
 */
async function main(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('playground.html is missing #root');
  // Fonts, sprites and level art load once here and are shared by every preview on the page.
  const resources = await loadGameResources();
  const loop = new PreviewLoop();
  window.__playground = {
    boards: Object.fromEntries(
      PLAYGROUND_BOARDS.map((board) => [board.id, comparedPicker(board).choices.map((choice) => choice.id)]),
    ),
    loop,
  };
  createRoot(root).render(
    <StrictMode>
      <Playground
        runtime={{ resources, loop, audio: createGameAudio() }}
        boards={PLAYGROUND_BOARDS}
        initial={readUrlState(window.location.search, PLAYGROUND_BOARDS)}
      />
    </StrictMode>,
  );
}

main().catch((error: unknown) => {
  console.error('The playground failed to load', error);
  const root = document.getElementById('root');
  if (root) root.textContent = 'The playground failed to load; the console says why.';
});
