import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from '@/game/createGame';
import { App } from './App';
import { readHarnessConfig } from './harness/config';
import { startGame } from './harness/harness';
import { chooseHost, detectWebGL } from './hosts';
import './styles.css';

async function main(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  const config = readHarnessConfig(window.location.search, import.meta.env.DEV);
  const created = await createGame(config.seed === null ? {} : { seed: config.seed });
  createRoot(root).render(
    <StrictMode>
      <App created={created} host={chooseHost(config.host, detectWebGL)} />
    </StrictMode>,
  );
  startGame(created, config);
}

void main();
