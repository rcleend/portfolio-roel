import type { Dispatch } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import {
  type PlaygroundAction,
  type PlaygroundState,
  TILE_ZOOMS,
  type TileZoom,
  type Toggle,
} from '../state/playgroundState';
import { type Segment, Segmented } from './Segmented';
import { ToggleButton } from './ToggleButton';

interface SettingsProps {
  readonly state: Pick<PlaygroundState, Toggle | 'zoom'>;
  readonly dispatch: Dispatch<PlaygroundAction>;
  /** The synthesiser, unlocked by the click that turns sound on. */
  readonly audio: GameAudio;
}

const ZOOMS: readonly Segment<TileZoom>[] = [
  { value: 'auto', label: 'Auto', hint: 'As large as two tiles side by side allow' },
  ...TILE_ZOOMS.map((zoom) => ({ value: zoom, label: `${zoom}×` })),
];

/** How every preview on the page looks and sounds, and how large the tiles are. */
export function Settings({ state, dispatch, audio }: SettingsProps) {
  const toggle = (setting: Toggle): void => dispatch({ type: 'toggle', setting });
  return (
    <div className="bar__settings">
      <ToggleButton
        pressed={state.crt}
        onToggle={() => toggle('crt')}
        hint="Scanlines and vignette, as on the fallback television"
      >
        CRT
      </ToggleButton>
      <ToggleButton
        pressed={state.reducedMotion}
        onToggle={() => toggle('reducedMotion')}
        hint="Every scene as visitors who prefer reduced motion see it"
      >
        Reduced motion
      </ToggleButton>
      <ToggleButton
        pressed={state.sound}
        onToggle={() => {
          // Browsers only let a page make sound from a gesture, and this click is one.
          if (!state.sound) void audio.unlock();
          toggle('sound');
        }}
        hint="Plays the focused view; the boards stay silent"
      >
        Sound
      </ToggleButton>
      <Segmented
        label="Tiles"
        visibleLabel
        segments={ZOOMS}
        value={state.zoom}
        onChange={(zoom) => dispatch({ type: 'zoom', zoom })}
      />
    </div>
  );
}
