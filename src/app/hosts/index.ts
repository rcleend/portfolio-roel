import type { ComponentType } from 'react';
import { FlatHost } from './FlatHost';
import type { HostKind, HostProps } from './types';

export { chooseHost, detectWebGL } from './chooseHost';
export type { HostKind, HostProps } from './types';

/**
 * Host components by kind.
 *
 * SEAM(room): the 3D room host is not built yet, so `room` renders the flat
 * TV. The room crew replaces `FlatHost` below with `RoomHost` — the only line
 * that has to change to switch the default experience to the attic room.
 */
export const hosts: Readonly<Record<HostKind, ComponentType<HostProps>>> = {
  flat: FlatHost,
  room: FlatHost,
};
