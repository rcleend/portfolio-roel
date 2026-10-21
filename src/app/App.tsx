import { useEffect, useReducer, useState } from 'react';
import type { CreatedGame } from '@/game/createGame';
import { Arcade } from './Arcade';
import type { HarnessConfig } from './harness/config';
import type { HostKind } from './hosts';
import { Resume } from './resume/Resume';
import { LoadingScreen } from './startup/LoadingScreen';
import { INITIAL_STARTUP, loadingProgress, startupReducer } from './startup/startup';

export interface AppProps {
  /** Started before React renders, so fonts and level art download in parallel with the app shell. */
  readonly loading: Promise<CreatedGame>;
  readonly host: HostKind;
  readonly config: HarnessConfig;
}

/**
 * Page layout and opening choreography: loading screen → TV revealed dark →
 * power-on → game. The skip link and the résumé are there from the first
 * paint, whatever happens to the game.
 */
export function App({ loading, host, config }: AppProps) {
  const [startup, dispatch] = useReducer(startupReducer, INITIAL_STARTUP);
  const [created, setCreated] = useState<CreatedGame | null>(null);
  const showLoading = startup.phase === 'loading' || startup.phase === 'revealing' || startup.phase === 'failed';

  useEffect(() => {
    let cancelled = false;
    loading.then(
      (game) => {
        if (cancelled) return;
        setCreated(game);
        dispatch({ type: 'gameLoaded' });
      },
      (error: unknown) => {
        console.error('The game failed to load', error);
        if (!cancelled) dispatch({ type: 'gameFailed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loading]);

  return (
    <>
      <a className="skip-link" href="#resume">
        Skip to résumé
      </a>
      {created ? <Arcade created={created} host={host} config={config} startup={startup} dispatch={dispatch} /> : null}
      {showLoading ? (
        <LoadingScreen
          progress={loadingProgress(startup)}
          failed={startup.phase === 'failed'}
          leaving={startup.phase === 'revealing'}
          onLeft={() => dispatch({ type: 'revealed' })}
        />
      ) : null}
      <Resume />
    </>
  );
}
