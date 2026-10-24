import { useEffect, useState, useSyncExternalStore } from 'react';
import { ALBUMS } from '@/content/radio/albums';
import { resolveFile } from '@/content/radio/files';
import type { Album } from '@/content/radio/types';
import type { DiscArt, RadioDeck, RadioView } from './deck';
import { paintDiscLabel } from './labels/discLabel';
import { loadArt } from './labels/loadArt';
import { FoleyPlayer } from './player/FoleyPlayer';
import { MusicElement } from './player/MusicElement';
import { MediaSessionBridge } from './player/mediaSession';
import { RadioPlayer } from './player/RadioPlayer';
import { RadioControls } from './ui/RadioControls';

export interface RadioExperienceProps {
  readonly deck: RadioDeck;
  readonly view: RadioView;
  readonly muted: boolean;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

/**
 * The CD player's app side (docs/RADIO.md), lazy-loaded into the room's controls slot:
 * the shelf's prints for the room, the player behind the room's deck, and the controls.
 * It stays mounted once loaded, so the music survives leaving the radio.
 */
export function RadioExperience({ deck, view, muted, onLeave, onFocusStage }: RadioExperienceProps) {
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
  useDiscPrints(deck, ALBUMS);
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

/**
 * Gives the room the shelf at once as plain discs (it lays out the slots), then each disc's
 * print, painted at the room's label size from art decoded off the main thread.
 */
function useDiscPrints(deck: RadioDeck, albums: readonly Album[]): void {
  useEffect(() => {
    deck.setDiscs(albums.map((album) => ({ id: album.id, label: null })));
    let cancelled = false;
    const size = deck.labelSize;
    Promise.all(albums.map((album) => discPrint(album, size, () => cancelled))).then((discs) => {
      if (!cancelled) deck.setDiscs(discs);
    });
    return () => {
      cancelled = true;
    };
  }, [deck, albums]);
}

async function discPrint(album: Album, size: number, cancelled: () => boolean): Promise<DiscArt> {
  const name = album.disc ?? album.cover;
  let image: ImageBitmap | null = null;
  try {
    image = await loadArt(resolveFile(album, name), size);
  } catch (error) {
    console.warn(`The disc print of "${album.title}" could not load; it gets a plain one`, error);
  }
  if (cancelled()) {
    image?.close();
    return { id: album.id, label: null };
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) paintDiscLabel(context, size, image ? { kind: album.disc ? 'print' : 'cover', image } : null, album);
  image?.close();
  return { id: album.id, label: canvas };
}
