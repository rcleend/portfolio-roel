import { useEffect, useState } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import type { SessionStore } from '@/game/session';
import type { HostView } from '../hosts/types';
import { onFirstGesture } from './firstGesture';

/**
 * Connects the game's audio to the page: unlocks it on the first gesture
 * anywhere, mirrors the persisted mute preference, and freezes everything
 * while the visitor looks around the room (the game is paused then too).
 */
export function useAudioWiring(
  audio: GameAudio,
  session: SessionStore,
  view: HostView,
): { readonly muted: boolean; toggleMuted(): void } {
  const [muted, setMuted] = useState(() => session.state.muted);

  useEffect(() => onFirstGesture(window, () => audio.unlock()), [audio]);

  useEffect(() => {
    audio.muted = muted;
  }, [audio, muted]);

  useEffect(() => {
    audio.setPaused(view !== 'tv');
  }, [audio, view]);

  const toggleMuted = (): void => {
    const next = session.update((state) => ({ ...state, muted: !state.muted })).muted;
    setMuted(next);
  };

  return { muted, toggleMuted };
}
