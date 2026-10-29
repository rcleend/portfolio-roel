import { useEffect, useReducer, useState } from 'react';
import type { CreatedGame } from '@/game/createGame';
import { Arcade } from './Arcade';
import type { HarnessConfig } from './harness/config';
import type { HostKind } from './hosts';
import { Resume } from './resume/Resume';
import { INITIAL_STARTUP, startupReducer } from './startup/startup';
import { TvStill } from './startup/TvStill';

export interface AppProps {
  /** Started before React renders, so fonts and level art download in parallel with the app shell. */
  readonly loading: Promise<CreatedGame>;
  readonly host: HostKind;
  readonly config: HarnessConfig;
}

/**
 * Page layout and opening choreography: the room's startup still with its
 * tube dark → power-on → game on it → the live room takes over (docs/ROOM.md ›
 * Startup). The skip link and the résumé are there from the first paint,
 * whatever happens to the game.
 */
export function App({ loading, host, config }: AppProps) {
  const [startup, dispatch] = useReducer(startupReducer, INITIAL_STARTUP);
  const [created, setCreated] = useState<CreatedGame | null>(null);
  // The still stands for the room; a flat host (asked for, or the room's fallback) has its own TV.
  const still = host === 'room' && startup.host !== 'flat';
  const failed = startup.phase === 'failed';

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
      {still || failed ? <TvStill shown={startup.still || failed} failed={failed} /> : null}
      <Resume />
    </>
  );
}
