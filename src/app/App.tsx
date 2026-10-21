import type { CreatedGame } from '@/game/createGame';
import { type HostKind, hosts } from './hosts';
import { Resume } from './resume/Resume';

export interface AppProps {
  readonly created: CreatedGame;
  readonly host: HostKind;
}

/** Page layout: skip link, the game in its host, and the accessible résumé. */
export function App({ created, host }: AppProps) {
  const Host = hosts[host];
  return (
    <>
      <a className="skip-link" href="#resume">
        Skip to résumé
      </a>
      <div id="game">
        <Host surface={created.surface} />
      </div>
      <Resume />
    </>
  );
}
