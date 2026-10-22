import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from '@/game/createGame';
import { App } from './App';
import { readHarnessConfig } from './harness/config';
import { chooseHost, detectWebGL } from './hosts';
import { openLink } from './links/openLink';
import '@fontsource/silkscreen/400.css';
import './styles.css';

function main(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  const config = readHarnessConfig(window.location.search, import.meta.env.DEV);
  // Kick off the game's downloads before React's first render; the app shows progress meanwhile.
  const loading = createGame({
    ...(config.seed === null ? {} : { seed: config.seed }),
    ...(config.looks === null ? {} : { looks: config.looks }),
    openLink,
  });
  createRoot(root).render(
    <StrictMode>
      <App loading={loading} host={chooseHost(config.host, detectWebGL)} config={config} />
    </StrictMode>,
  );
}

main();
