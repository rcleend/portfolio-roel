import { useEffect, useRef, useState } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import type { SessionStore } from '@/game/session';
import type { HostView } from '../hosts/types';
import { onFirstGesture } from './firstGesture';
import { claimPlayback } from './playbackSession';

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

  // The first gesture anywhere unlocks the game's audio (silently while muted); with the sound on it also claims
  // iOS's playback session, so the ringer switch does not silence it.
  const mutedNow = useRef(muted);
  mutedNow.current = muted;
  useEffect(
    () =>
      onFirstGesture(window, () => {
        if (!mutedNow.current) claimPlayback(true);
        return audio.unlock();
      }),
    [audio],
  );

  useEffect(() => {
    audio.muted = muted;
  }, [audio, muted]);

  useEffect(() => {
    audio.setPaused(view !== 'tv');
  }, [audio, view]);

  // Runs inside the click: turning the sound on is a gesture of its own, so everything starts at once on iOS too
  // (the rain resumes from the same gesture, RainSound).
  const toggleMuted = (): void => {
    const next = session.update((state) => ({ ...state, muted: !state.muted })).muted;
    claimPlayback(!next);
    if (!next) void audio.unlock();
    setMuted(next);
  };

  return { muted, toggleMuted };
}
