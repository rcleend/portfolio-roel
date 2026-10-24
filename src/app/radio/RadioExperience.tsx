import { useEffect, useState, useSyncExternalStore } from 'react';
import { ALBUMS } from '@/content/radio/albums';
import { resolveFile } from '@/content/radio/files';
import type { Album } from '@/content/radio/types';
import { whenIdle } from '../pc/whenIdle';
import type { RadioDeck, RoomView } from './deck';
import { DiscPrints, type DiscPrintsHost } from './labels/discPrints';
import { loadArt } from './labels/loadArt';
import { FoleyPlayer } from './player/FoleyPlayer';
import { MusicElement } from './player/MusicElement';
import { MediaSessionBridge } from './player/mediaSession';
import { RadioPlayer } from './player/RadioPlayer';
import { RadioControls } from './ui/RadioControls';

export interface RadioExperienceProps {
  readonly deck: RadioDeck;
  readonly view: RoomView;
  /** The camera rests at `view`. */
  readonly settled: boolean;
  readonly muted: boolean;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

/**
 * The CD player's app side (docs/RADIO.md), lazy-loaded into the room's controls slot:
 * the shelf's prints for the room, the player behind the room's deck, and the controls.
 * It stays mounted once loaded, so the music survives leaving the radio.
 */
export function RadioExperience({ deck, view, settled, muted, onLeave, onFocusStage }: RadioExperienceProps) {
  const [player] = useState(
    () =>
      new RadioPlayer({
        deck,
        albums: ALBUMS,
        fileUrl: resolveFile,
        music: (listener) => new MusicElement(listener),
        foley: new FoleyPlayer(),
        session: MediaSessionBridge.forPage(),
        view,
        muted,
      }),
  );
  useEffect(() => player.connect(), [player]);
  useEffect(() => player.setView(view), [player, view]);
  useEffect(() => player.setMuted(muted), [player, muted]);
  // Prints are painted while the camera rests away from the game: never in a flight, never between the game's frames.
  useDiscPrints(deck, ALBUMS, settled && view !== 'tv');
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  return (
    <RadioControls
      deck={deck}
      player={player}
      snapshot={snapshot}
      albums={ALBUMS}
      muted={muted}
      onLeave={onLeave}
      onFocusStage={onFocusStage}
    />
  );
}

const PAGE: DiscPrintsHost = {
  loadArt,
  canvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    // On the CPU: the room reads the print back for its spin blur, which from a GPU canvas waits on the GPU.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return context ? { canvas, context } : null;
  },
  whenIdle,
};

/** The shelf's prints for the room: plain discs at once, then the prints, painted only while `allowed`. */
function useDiscPrints(deck: RadioDeck, albums: readonly Album[], allowed: boolean): void {
  const [prints, setPrints] = useState<DiscPrints | null>(null);
  useEffect(() => {
    const next = new DiscPrints(deck, albums, resolveFile, PAGE);
    next.start();
    setPrints(next);
    return () => next.dispose();
  }, [deck, albums]);
  useEffect(() => prints?.setAllowed(allowed), [prints, allowed]);
}
