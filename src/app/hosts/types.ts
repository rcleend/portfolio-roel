import type { GameSurface } from '@/engine/core/GameSurface';

/** Every host component receives only the host contract, never the game itself. */
export interface HostProps {
  readonly surface: GameSurface;
}

export type HostKind = 'flat' | 'room';
