import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssetStore } from '@/engine/assets/AssetStore';
import { loadLookLibrary } from '@/game/art/looks/load';
import { loadCustomerConcepts } from '@/game/art/looks/terraria/customer-concepts/concepts';
import { loadTerrariaDesigns } from '@/game/art/looks/terraria/designs';
import { createGameAudio } from '@/game/audio/createGameAudio';
import { loadGameResources } from '@/game/resources';
import { boardTiles } from './boards/board';
import { PLAYGROUND_BOARDS } from './boards/catalog';
import { Playground } from './Playground';
import { PreviewLoop } from './runtime/PreviewLoop';
import { readUrlState } from './state/urlState';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './playground.css';

/** What the playground shows and its transport, for Playwright, as `window.__playground`. */
export interface PlaygroundHandle {
  /** Every tile's key, by board id: one tile for each registered variant or look. */
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
 * Development harness): every registered title lockup and backdrop, and
 * every look of every hero, skill and the customer, live and side by side,
 * to pick winners.
 */
async function main(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('playground.html is missing #root');
  // Fonts, level art, every registered look and the Terraria designs and customer concepts the lineup draws load
  // once here, shared by every preview on the page.
  const assets = new AssetStore();
  const [resources, library] = await Promise.all([
    loadGameResources(assets),
    loadLookLibrary(assets),
    loadTerrariaDesigns(assets),
    loadCustomerConcepts(assets),
  ]);
  const loop = new PreviewLoop();
  window.__playground = {
    boards: Object.fromEntries(
      PLAYGROUND_BOARDS.map((board) => [board.id, boardTiles(board, {}).map((tile) => tile.key)]),
    ),
    loop,
  };
  createRoot(root).render(
    <StrictMode>
      <Playground
        runtime={{ resources, library, loop, audio: createGameAudio() }}
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
