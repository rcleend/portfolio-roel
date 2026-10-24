// src/app/radio/RadioSlot.tsx — placeholder; the player task replaces this file at the merge.
import type { ReactNode } from 'react';
import type { RadioDeck, RoomView } from '@/room';

export interface RadioSlotProps {
  readonly deck: RadioDeck | null;
  readonly view: RoomView;
  readonly powered: boolean;
  readonly muted: boolean;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

/** Until the player lands, the radio opens and shows plain discs, and plays nothing. */
export function RadioSlot(_props: RadioSlotProps): ReactNode {
  return null;
}
