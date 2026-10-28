import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from '@/game/createGame';
import { preloadSceneArt } from '@/game/scenes';
import { App } from './App';
import { watchInputModality } from './a11y/inputModality';
import { hidePointerUntilMoved } from './cursors/hidePointer';
import { readHarnessConfig } from './harness/config';
import { chooseHost, detectWebGL } from './hosts';
import { openLink } from './links/openLink';
import { loadUiFonts } from './startup/uiFonts';
import '@fontsource/silkscreen/400.css';
// The room's UI faces, latin only; a face downloads the first time something on the page is set in it.
import '@fontsource/chewy/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';
import './cursors/cursors.css';

function main(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  hidePointerUntilMoved();
  watchInputModality();
  // The loading screen's faces download with the first chunk rather than when it first paints them.
  void loadUiFonts();
  const config = readHarnessConfig(window.location.search, import.meta.env.DEV);
  // Kick off the game's downloads before React's first render; the app shows progress meanwhile.
  const loading = createGame({
    ...(config.seed === null ? {} : { seed: config.seed }),
    ...(config.looks === null ? {} : { looks: config.looks }),
    openLink,
  }).then(async (created) => {
    // A development scene the harness opens may draw art the game never loads; it must be in before the first frame.
    if (config.scene !== null) await preloadSceneArt(config.scene, created.services.assets);
    return created;
  });
  createRoot(root).render(
    <StrictMode>
      <App loading={loading} host={chooseHost(config.host, detectWebGL)} config={config} />
    </StrictMode>,
  );
}

main();
