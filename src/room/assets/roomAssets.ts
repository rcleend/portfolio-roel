import type { Group } from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LoadProgress } from './loadProgress';

/**
 * The runtime files mirrored into public/room/ by scripts/sync-room-assets.mjs.
 * Byte sizes only weight the progress bar before the server reports real sizes.
 */
const ROOM_FILES = {
  room: { file: 'room.glb', approxBytes: 5_461_004 },
  tv: { file: 'tv-high.glb', approxBytes: 556_912 },
  pc: { file: 'pc-base.glb', approxBytes: 269_724 },
  radio: { file: 'radio-base.glb', approxBytes: 518_904 },
  ps2: { file: 'ps2-base.glb', approxBytes: 1_060_236 },
} as const;

type RoomFileKey = keyof typeof ROOM_FILES;

export interface RoomAssets {
  /** Baked, unlit environment (walls, furniture, posters) plus the lava animation clip. */
  readonly room: GLTF;
  /** The CRT television at close-up detail; holds the replaceable screen mesh. */
  readonly tv: Group;
  /** PBR hero devices other than the TV (PC, radio, PlayStation 2). */
  readonly devices: readonly Group[];
}

export async function loadRoomAssets(baseUrl: string, onProgress: (fraction: number) => void): Promise<RoomAssets> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const expected = Object.fromEntries(Object.entries(ROOM_FILES).map(([key, f]) => [key, f.approxBytes]));
  const progress = new LoadProgress(expected, onProgress);

  const load = async (key: RoomFileKey): Promise<GLTF> => {
    const gltf = await loader.loadAsync(new URL(ROOM_FILES[key].file, baseUrl).href, (event) => {
      progress.update(key, event.loaded, event.lengthComputable ? event.total : undefined);
    });
    progress.complete(key);
    return gltf;
  };

  const [room, tv, pc, radio, ps2] = await Promise.all([
    load('room'),
    load('tv'),
    load('pc'),
    load('radio'),
    load('ps2'),
  ]);
  return { room, tv: tv.scene, devices: [pc.scene, radio.scene, ps2.scene] };
}
