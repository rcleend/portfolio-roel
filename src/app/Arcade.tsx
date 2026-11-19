import { type Dispatch, useEffect, useMemo, useRef, useState } from 'react';

import type { CreatedGame } from '@/game/createGame';
import { bindings } from '@/game/input/bindings';
import { SoundToggle } from './audio/SoundToggle';
import { useAudioWiring } from './audio/useAudioWiring';
import type { HarnessConfig } from './harness/config';
import { startGame } from './harness/harness';
import { type HostEvents, type HostKind, type HostView, hosts } from './hosts';
import type { SceneSignal } from './hosts/types';
import { padActionMap } from './overlays/touchpad/padActions';
import { type Insets, NO_INSETS } from './overlays/touchpad/padGeometry';
import { TouchPad } from './overlays/touchpad/TouchPad';
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
 * The game in its host plus everything layered over it: the sound toggle
 * and the touch pad (the room host brings its own guide). Mounted once the
 * game exists; the startup choreography itself lives in `App`.
 */
export function Arcade({ created, host, config, startup, dispatch }: ArcadeProps) {
  const { services, game } = created;
  const [view, setView] = useState<HostView>('tv');
  const [padInsets, setPadInsets] = useState<Insets>(NO_INSETS);
  const touch = useMediaQuery(COARSE_POINTER);
  const landscape = useMediaQuery('(orientation: landscape)');
  const audio = useAudioWiring(services.audio, services.session, view);
  const started = useRef(false);
  const begun = useBegun(services.director);
  const running = startup.phase === 'running';
  // `?capture` keeps the tube dark: the live set as the startup still is sampled from and held to (harness/config.ts).
  const powering = (startup.phase === 'powering' || running) && !config.capture;

  const events = useMemo<HostEvents>(
    () => ({
      onReady: (kind) => dispatch({ type: 'hostReady', host: kind }),
      onPoweredOn: () => {
        // The first game frame must land on a lit tube, and only once.
        if (started.current) return;
        started.current = true;
        startGame(created, config);
        dispatch({ type: 'poweredOn' });
      },
      onViewChange: setView,
      onStillDone: () => dispatch({ type: 'stillDone' }),
      onStillBack: () => dispatch({ type: 'stillBack' }),
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
          scenes={services.director}
          powered={powering}
          still={startup.still}
          clear={startup.clear}
          insets={touch ? padInsets : NO_INSETS}
          events={events}
          muted={audio.muted}
        />
      </div>
      <SoundToggle muted={audio.muted} onToggle={audio.toggleMuted} />
      {touch ? (
        <TouchPad
          actions={PAD_ACTIONS}
          sink={game.input.virtual}
          visible={running && view === 'tv' && begun && startup.clear}
          layout={landscape ? 'sides' : 'bottom'}
          onInsetsChange={setPadInsets}
        />
      ) : null}
    </>
  );
}

/**
 * Whether the visitor has pressed past the title (round six, item 33): the touch pad fades in only then, so the start
 * screen shows the game alone with "PRESS TO BEGIN", and a tap anywhere begins. Once begun it stays. The pad also
 * waits for the startup still to be out of sight (`startup.clear`), so it never arrives as part of the hand-over.
 */
function useBegun(scenes: SceneSignal): boolean {
  const [begun, setBegun] = useState(false);
  useEffect(() => {
    if (begun) return;
    const check = (): void => {
      const id = scenes.current;
      if (id !== null && id !== 'boot' && id !== 'title') setBegun(true);
    };
    check();
    return scenes.onSceneChange(check);
  }, [scenes, begun]);
  return begun;
}
