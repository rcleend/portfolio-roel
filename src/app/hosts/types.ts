import type { GameSurface } from '@/engine/core/GameSurface';
import type { RoomView } from '@/room';
import type { Insets } from '../overlays/touchpad/padGeometry';

export type HostKind = 'flat' | 'room';

/** Where the visitor is looking: at the TV (playing) or around the room (game paused). */
export type HostView = RoomView;

/** What a host tells the app while it loads and runs. */
export interface HostEvents {
  /** Download progress of the host's own assets, 0–1. */
  onProgress(fraction: number): void;
  /** Loaded and drawn with the tube dark; `kind` is the host actually presenting (after any fallback). */
  onReady(kind: HostKind): void;
  /** The picture is up after `powered` turned true: the game may start. */
  onPoweredOn(): void;
  onViewChange(view: HostView): void;
}

/** The game's scenes as the page sees them (the director): which one shows, and every switch. */
export interface SceneSignal {
  readonly current: string | null;
  onSceneChange(listener: (id: string) => void): () => void;
}

/**
 * Every host receives the host contract, never the game itself, plus the
 * page's choreography: when to light the tube and which strips of the
 * viewport overlays (the touch pad) cover.
 */
export interface HostProps {
  readonly surface: GameSurface;
  /** The game's scenes: the room's guide times its click-outside hint from the title. */
  readonly scenes: SceneSignal;
  /** Turns the TV on once true. Never turns back off. */
  readonly powered: boolean;
  readonly insets: Insets;
  readonly events: HostEvents;
  /** The site's sound preference (the sound toggle): the radio's music and mechanics follow it. */
  readonly muted: boolean;
}
