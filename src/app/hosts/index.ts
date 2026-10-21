import type { ComponentType } from 'react';
import { FlatHost } from './FlatHost';
import { RoomHost } from './RoomHost';
import type { HostKind, HostProps } from './types';

export { chooseHost, detectWebGL } from './chooseHost';
export type { HostEvents, HostKind, HostProps, HostView } from './types';

/** Host components by kind. `RoomHost` lazy-loads three.js and falls back to `FlatHost` on its own. */
export const hosts: Readonly<Record<HostKind, ComponentType<HostProps>>> = {
  flat: FlatHost,
  room: RoomHost,
};
