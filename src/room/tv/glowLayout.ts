import { Box3, Vector2, Vector3 } from 'three';
import type { GlowPatch } from './ScreenGlow';
import type { UvRect } from './screenMapping';
import type { TvModel } from './tvModel';

/**
 * Where the CRT's light lands in the attic. Surface positions were measured by ray casting
 * room.glb (revision 5, see docs/ROOM.md); the TV-relative parts follow the TV asset, so a
 * moved TV only needs these three numbers checked.
 */
const ROOM_SURFACES = {
  /** Top of the rug/floor in front of the TV cabinet. */
  floorY: 0.036,
  /** Top of the white TV cabinet. */
  cabinetTopY: 0.4865,
  /** Front face of the cabinet (the TV stands flush with it). */
  cabinetFrontX: 2.144,
} as const;

const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Glow patches for a TV facing -X (towards the room), which is how the attic is laid out.
 * `picture` is the content rect in screen UV space, so the bezel halo hugs the lit picture.
 */
export function atticGlowPatches(tv: TvModel, picture: UvRect): GlowPatch[] {
  const screenBox = new Box3().setFromObject(tv.screen);
  // Screen UV u runs along +Z (the viewer's right) and v runs down from the top edge.
  const screenZ = (u: number): number => screenBox.min.z + u * (screenBox.max.z - screenBox.min.z);
  const screenY = (v: number): number => screenBox.max.y - v * (screenBox.max.y - screenBox.min.y);
  const pictureCentre = new Vector2(
    (screenZ(picture.minU) + screenZ(picture.maxU)) / 2,
    (screenY(picture.minV) + screenY(picture.maxV)) / 2,
  );
  const pictureHalf = new Vector2(
    (screenZ(picture.maxU) - screenZ(picture.minU)) / 2,
    (screenY(picture.minV) - screenY(picture.maxV)) / 2,
  );
  const tvCentreZ = (tv.bounds.min.z + tv.bounds.max.z) / 2;
  const tvHalfZ = (tv.bounds.max.z - tv.bounds.min.z) / 2;
  // The strip starts exactly at the cabinet's front edge; past it there is only air.
  const cabinetStripX = ROOM_SURFACES.cabinetFrontX + 0.121;
  const towardsViewer = { right: new Vector3(0, 0, 1), up: WORLD_UP };
  // Lying on a horizontal surface: local +Y points away from the viewer, towards the wall.
  const lyingFlat = { right: new Vector3(0, 0, 1), up: new Vector3(1, 0, 0) };

  return [
    // Bloom over the bezel lip right around the picture.
    {
      ...towardsViewer,
      centre: new Vector3(tv.bounds.min.x - 0.003, pictureCentre.y, pictureCentre.x),
      size: new Vector2(pictureHalf.x * 2 + 0.16, pictureHalf.y * 2 + 0.16),
      emitterCentre: new Vector2(0, 0),
      emitterHalfSize: pictureHalf,
      falloff: 0.012,
      strength: 0.35,
      fillEmitter: false,
    },
    // The main pool of light on the floor in front of the cabinet.
    {
      ...lyingFlat,
      centre: new Vector3(ROOM_SURFACES.cabinetFrontX - 0.8, ROOM_SURFACES.floorY, pictureCentre.x),
      size: new Vector2(2.4, 1.6),
      // Brightest about half a metre out, where the light meets the floor most squarely.
      emitterCentre: new Vector2(0, 0.3),
      emitterHalfSize: new Vector2(0.18, 0.12),
      falloff: 0.45,
      strength: 0.38,
      fillEmitter: true,
    },
    // Spill along the cabinet top either side of the TV.
    {
      ...lyingFlat,
      centre: new Vector3(cabinetStripX, ROOM_SURFACES.cabinetTopY + 0.001, tvCentreZ),
      size: new Vector2(tvHalfZ * 2 + 0.7, 0.24),
      // The screen's bottom edge: light reaches the top beside the TV, not behind it.
      emitterCentre: new Vector2(0, tv.bounds.min.x - cabinetStripX),
      emitterHalfSize: new Vector2(tvHalfZ, 0.004),
      falloff: 0.08,
      strength: 0.4,
      fillEmitter: false,
    },
  ];
}
