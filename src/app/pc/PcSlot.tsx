// src/app/pc/PcSlot.tsx — placeholder; the PC screen task replaces this file at the merge.
import type { ReactNode } from 'react';
import type { PcMonitor, RoomView } from '@/room';

export interface PcSlotProps {
  readonly display: PcMonitor | null;
  readonly view: RoomView;
  readonly powered: boolean;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

/** Until the PC screen experience lands, the monitor keeps its dark standby tube. */
export function PcSlot(_props: PcSlotProps): ReactNode {
  return null;
}
