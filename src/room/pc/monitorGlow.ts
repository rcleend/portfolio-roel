import { type Box3, Vector2, Vector3 } from 'three';
import type { GlowPatch } from '../tv/ScreenGlow';
import { type GlassPlane, planeCentre, planeHeight, planeWidth } from './glassPlane';

/**
 * Where the monitor's light lands: its bezel lip, the desk in front of it and the keyboard.
 * The room is baked and unlit, so like the TV's spill these are additive quads drawn by the
 * TV's ScreenGlow (one shader program for every screen in the room).
 */
export interface MonitorGlowModel {
  readonly picture: GlassPlane;
  readonly shellFrontZ: number;
  readonly keyboardBounds: Box3;
}

/** Top of the desk (room.glb `02_Desk`, ray cast); the patch floats a millimetre above it. */
const DESK_TOP_Y = 0.785;
/** The desk patch reaches this far towards the viewer from the shell front… */
const DESK_REACH = 0.6;
const DESK_PATCH = new Vector2(1.0, 0.7);
/** …and is lit from a strip at the monitor's foot this deep. */
const FOOT_HALF_DEPTH = 0.02;
/** Margin around the keyboard's footprint, so the patch fades out beyond its edges. */
const KEYBOARD_MARGIN = 0.05;
const KEYBOARD_STRIP_HALF_DEPTH = 0.01;
/** Clear of the bezel lip, so the quad never z-fights the shell. */
const BEZEL_LIFT = 0.003;
const BEZEL_MARGIN = 0.08;

/** Tuned by eye in the room lab within ±50 % of these. */
const BEZEL = { falloff: 0.012, strength: 0.3 } as const;
const DESK = { falloff: 0.25, strength: 0.3 } as const;
const KEYBOARD = { falloff: 0.15, strength: 0.25 } as const;

/** Facing the viewer (+Z). */
const UPRIGHT = { right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };
/** Lying on a horizontal surface: local +Y points away from the viewer, towards the wall. */
const LYING_FLAT = { right: new Vector3(1, 0, 0), up: new Vector3(0, 0, -1) };

/**
 * The three patches for a monitor seen from `eye`, the settled eye at the PC: the bezel's
 * emitter is the picture as that eye sees it on the bezel's plane, so its halo starts exactly at
 * the picture's edge on the page.
 */
export function monitorGlowPatches(model: MonitorGlowModel, eye: Vector3): GlowPatch[] {
  const { picture, shellFrontZ, keyboardBounds } = model;
  const centre = planeCentre(picture);
  const bezelZ = shellFrontZ + BEZEL_LIFT;
  const bezel = bezelEmitter(model, eye);
  const deskCentreZ = shellFrontZ + DESK_REACH - DESK_PATCH.y / 2;
  const keyboard = {
    centreX: (keyboardBounds.min.x + keyboardBounds.max.x) / 2,
    centreZ: (keyboardBounds.min.z + keyboardBounds.max.z) / 2,
    width: keyboardBounds.max.x - keyboardBounds.min.x,
    depth: keyboardBounds.max.z - keyboardBounds.min.z,
  };
  const pictureHalfWidth = planeWidth(picture) / 2;

  return [
    // Halo over the bezel lip right around the picture.
    {
      ...UPRIGHT,
      centre: new Vector3(centre.x, centre.y, bezelZ),
      size: new Vector2(planeWidth(picture) + BEZEL_MARGIN * 2, planeHeight(picture) + BEZEL_MARGIN * 2),
      emitterCentre: bezel.centre,
      emitterHalfSize: bezel.halfSize,
      falloff: BEZEL.falloff,
      strength: BEZEL.strength,
      fillEmitter: false,
    },
    // The pool of light on the desk in front of the monitor.
    {
      ...LYING_FLAT,
      centre: new Vector3(centre.x, DESK_TOP_Y + 0.001, deskCentreZ),
      size: DESK_PATCH.clone(),
      // Local +Y points to the wall: the monitor's foot is this far behind the patch's centre.
      emitterCentre: new Vector2(0, deskCentreZ - shellFrontZ),
      emitterHalfSize: new Vector2(pictureHalfWidth, FOOT_HALF_DEPTH),
      falloff: DESK.falloff,
      strength: DESK.strength,
      fillEmitter: true,
    },
    // The keyboard deck, brightest along its back edge nearest the screen.
    {
      ...LYING_FLAT,
      centre: new Vector3(keyboard.centreX, keyboardBounds.max.y + 0.001, keyboard.centreZ),
      size: new Vector2(keyboard.width + KEYBOARD_MARGIN * 2, keyboard.depth + KEYBOARD_MARGIN * 2),
      emitterCentre: new Vector2(centre.x - keyboard.centreX, keyboard.centreZ - keyboardBounds.min.z),
      emitterHalfSize: new Vector2(pictureHalfWidth, KEYBOARD_STRIP_HALF_DEPTH),
      falloff: KEYBOARD.falloff,
      strength: KEYBOARD.strength,
      fillEmitter: true,
    },
  ];
}

/** The bezel patch's emitter for `eye`, in the quad's local metres; changes only with the eye. */
export function bezelEmitter(model: MonitorGlowModel, eye: Vector3): { centre: Vector2; halfSize: Vector2 } {
  const { picture, shellFrontZ } = model;
  const centre = planeCentre(picture);
  // The picture lies on the rim plane; the bezel lip is in front of it, closer to the eye.
  const scale = (shellFrontZ + BEZEL_LIFT - eye.z) / (picture.z - eye.z);
  const towards = (from: number, at: number): number => from + (at - from) * scale;
  const projected = { x: towards(eye.x, centre.x), y: towards(eye.y, centre.y) };
  return {
    centre: new Vector2(projected.x - centre.x, projected.y - centre.y),
    halfSize: new Vector2((planeWidth(picture) / 2) * scale, (planeHeight(picture) / 2) * scale),
  };
}
