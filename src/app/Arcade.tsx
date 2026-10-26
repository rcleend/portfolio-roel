import { type Dispatch, useEffect, useMemo, useRef, useState } from 'react';
import type { CreatedGame } from '@/game/createGame';
import { bindings } from '@/game/input/bindings';
import { SoundToggle } from './audio/SoundToggle';
import { useAudioWiring } from './audio/useAudioWiring';
import type { HarnessConfig } from './harness/config';
import { startGame } from './harness/harness';
import { type HostEvents, type HostKind, type HostView, hosts } from './hosts';
import { padActionMap } from './overlays/touchpad/padActions';
import { type Insets, NO_INSETS } from './overlays/touchpad/padGeometry';
import { TouchPad } from './overlays/touchpad/TouchPad';
import { ViewHint } from './overlays/view-hint/ViewHint';
import type { StartupEvent, StartupState } from './startup/startup';
import { COARSE_POINTER, useMediaQuery } from './useMediaQuery';

export interface ArcadeProps {
  readonly created: CreatedGame;
  readonly host: HostKind;
  readonly config: HarnessConfig;
  readonly startup: StartupState;
  readonly dispatch: Dispatch<StartupEvent>;
}

const PAD_ACTIONS = padActionMap(bindings);

/**
 * The game in its host plus everything layered over it: sound toggle,
 * view hint and touch pad. Mounted once the game exists; the startup
 * choreography itself lives in `App`.
 */
export function Arcade({ created, host, config, startup, dispatch }: ArcadeProps) {
  const { services, game } = created;
  const [view, setView] = useState<HostView>('tv');
  const [padInsets, setPadInsets] = useState<Insets>(NO_INSETS);
  const touch = useMediaQuery(COARSE_POINTER);
  const landscape = useMediaQuery('(orientation: landscape)');
  const audio = useAudioWiring(services.audio, services.session, view);
  const started = useRef(false);
  const running = startup.phase === 'running';
  const powering = startup.phase === 'powering' || running;

  const events = useMemo<HostEvents>(
    () => ({
      onProgress: (fraction) => dispatch({ type: 'hostProgress', fraction }),
      onReady: (kind) => dispatch({ type: 'hostReady', host: kind }),
      onPoweredOn: () => {
        // The first game frame must land on a lit tube, and only once.
        if (started.current) return;
        started.current = true;
        startGame(created, config);
        dispatch({ type: 'poweredOn' });
      },
      onViewChange: setView,
    }),
    [created, config, dispatch],
  );

  useEffect(() => {
    if (startup.phase === 'powering') services.audio.playSfx('power-on');
  }, [startup.phase, services.audio]);

  const Host = hosts[host];
  return (
    <>
      <div id="game" data-phase={startup.phase}>
        <Host
          surface={created.surface}
          powered={powering}
          insets={touch ? padInsets : NO_INSETS}
          events={events}
          muted={audio.muted}
        />
      </div>
      <SoundToggle muted={audio.muted} onToggle={audio.toggleMuted} />
      <ViewHint view={view} active={running && startup.host === 'room'} touch={touch} />
      {touch ? (
        <TouchPad
          actions={PAD_ACTIONS}
          sink={game.input.virtual}
          visible={running && view === 'tv'}
          layout={landscape ? 'sides' : 'bottom'}
          onInsetsChange={setPadInsets}
        />
      ) : null}
    </>
  );
}
