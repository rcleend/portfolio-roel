import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, MultiplyBlending } from 'three';
import { FLIGHT_MS, MAX_CUT_HOLD_MS } from '../camera/CameraRig';
import { deviceMemory } from '../radio/deviceFacts';
import { QUIET } from '../stage/IdleWork';
import type { RoomStage } from '../stage/RoomStage';
import { isSlow } from '../stage/slowDevice';
import { allocateStripTarget, uploadStrips } from '../stage/stripUpload';
import { type PosterTier, posterTier } from './posterTier';
import { anyInView, decorBoxes } from './posterVisibility';

/**
 * The opaque pass draws by `renderOrder` first: the room (0), then the skirts multiplied onto its wall, then the cards
 * over both.
 */
export const POSTERS_SKIRTS_ORDER = 1;
export const POSTERS_CARDS_ORDER = 2;
/**
 * Fading in (late bytes), the cards are transparent and draw first in the transparent pass, before the power LED's
 * halo and the screen fade (0) and the screen glow (10), all of which are in front of the walls.
 */
export const POSTERS_FADING_CARDS_ORDER = -1;

/**
 * Everything the lazy PosterWall runs that the room's chunk already carries (three.js, the camera rig, the device
 * facts, the strip uploader), handed over rather than imported. Rolldown folds a module shared by the room and a lazy
 * chunk into the room's chunk only when that lazy chunk already depends on the room's; a PosterWall that imported any
 * of these at runtime split them, three.js included, into a common chunk that every visitor loads before the TV
 * (measured: +2.2 kB gz on the critical path, nearly all of it cross-chunk glue). So PosterWall and what it paints
 * with import nothing of the room's chunk but types (PosterWall.test.ts holds them to that), and this kit is their one
 * runtime seam to the room.
 */
export const posterKit = {
  /** The camera's flight time, which bounds the first flight's frame sample. */
  flightMs: FLIGHT_MS,
  /** The longest a reduced-motion cut stays black for what it shows (CameraRig): the posters hold one at most. */
  cutHoldMs: MAX_CUT_HOLD_MS,
  /** The tier for this stage and device, decided once at the TV (posterTier.ts). */
  tier(stage: RoomStage): PosterTier {
    const { width, height, pixelRatio } = stage.size;
    return posterTier({
      width,
      height,
      pixelRatio,
      deviceMemory: deviceMemory(),
      softwareGpu: stage.softwareGpu,
    });
  },
  /** A hardware GPU's first flight (frame timestamps) that could not hold 30 fps. */
  slowFlight: (frames: readonly number[]): boolean => isSlow(false, frames),
  /** IdleWork's QUIET: the unit it leads to is an upload. */
  quiet: QUIET,
  allocateStripTarget,
  uploadStrips,
  decorBoxes,
  anyInView,
  group: (): Group => new Group(),
  /** A mesh of the wall's own numbers (posters/wall/geometry.ts): positions, atlas coordinates, triangles. */
  mesh(
    numbers: { readonly positions: Float32Array; readonly uvs: Float32Array; readonly indices: Uint16Array },
    material: MeshBasicMaterial,
  ): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(numbers.positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(numbers.uvs, 2));
    geometry.setIndex(new BufferAttribute(numbers.indices, 1));
    // Unlit, the walls need no normals; but a program is keyed by whether its geometry has them (three's
    // `vertexNormals`), and with them the cards draw with the baked room's own opaque program instead of a second one.
    geometry.computeVertexNormals();
    return new Mesh(geometry, material);
  },
  skirtsOrder: POSTERS_SKIRTS_ORDER,
  cardsOrder: POSTERS_CARDS_ORDER,
  fadingCardsOrder: POSTERS_FADING_CARDS_ORDER,
  /**
   * The cards: the room's opaque unlit program, pulled 1 unit towards the camera over the wall, drawn after the skirts
   * (POSTERS_CARDS_ORDER) so that wherever a card or its tape is, it is what shows.
   */
  cardsMaterial: (): MeshBasicMaterial =>
    new MeshBasicMaterial({
      name: 'posters_cards',
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  /**
   * The skirts: multiplied onto the wall (premultiplied, no depth write), pulled 2 units over it. Not `transparent`: they
   * draw in the opaque pass, after the room and before the cards (POSTERS_SKIRTS_ORDER), three applying their blending
   * there all the same, so a card or a tape overhang drawn after them covers them and no depth test between two
   * surfaces 0.2 mm apart decides it (at an oblique angle the polygon offsets' slope term outweighs that gap).
   */
  skirtsMaterial: (): MeshBasicMaterial =>
    new MeshBasicMaterial({
      name: 'posters_skirts',
      blending: MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
} as const;

export type PosterKit = typeof posterKit;
