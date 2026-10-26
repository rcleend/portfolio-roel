/**
 * The computer's monitor as the room presents it (docs/PC.md › Contract with the room). The screen experience
 * names it `PcDisplay`, but it is the room's own `PcMonitor` contract, so the type checker proves that `room.pc`
 * satisfies what the screen relies on. Types only: no room code reaches the PC chunks.
 */
export type { PcMonitor as PcDisplay, RgbColor, ScreenRect, StillPainter, StillRequest } from '@/room';
