import { MathUtils, Quaternion, Vector3 } from 'three';
import { clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic } from '../../motion/easing';
import { DISC_RADIUS, type DiscSlot } from '../discLayout';
import { slotOrientation } from '../radioFraming';
import { ATTENTION, DECK, seatOrientation } from './deckLayout';
import { springAt } from './springs';

/**
 * The paths a CD takes (docs/ROOM.md › The CD player), as pure functions of time: the rise out of the magazine
 * slot like toast, the glide and flip to its slot, the settle; the pick, flight, drop and bounce onto the spindle;
 * the unseat and flight home; the return and sink when the visitor leaves; and the idle float in between. Each
 * segment starts from a live pose, so a retarget never jumps.
 */

export interface DiscPose {
  readonly position: Vector3;
  readonly orientation: Quaternion;
  readonly scale: number;
}

/** One stretch of a disc's motion: its pose from `start` to `end`. */
export interface PoseSegment {
  readonly start: number;
  readonly end: number;
  at(t: number): DiscPose;
}

export const DISC_MOTION = {
  rise: {
    ms: 220,
    warmMs: 180,
    hiddenBelow: 0.075,
    apexY: 1.205,
    apexStep: 0.014,
    offsetShare: 0.22,
    maxOffset: 0.045,
  },
  /** Rising discs spin about their own axis at this speed (rad/s). */
  riseSpin: 14,
  glide: { ms: 440, warmMs: 380, lift: 0.07, depthShare: 0.35, flipFrom: 0.15, flipTo: 0.75, scaleFrom: 0.94 },
  glideSpinTau: 350,
  settle: { overshoot: 0.006, zeta: 0.5, hz: 3.2, ms: 300 },
  stagger: { min: 30, max: 60, span: 240, warm: 40 },
  pick: {
    anticipationMs: 90,
    dip: 0.006,
    forward: 0.01,
    scale: 1.08,
    flightMs: 560,
    approachAbove: 0.093,
    controlUp: 0.06,
    controlForward: 0.08,
    dropMs: 120,
    bounce: 0.0015,
    bounceMs: 50,
    spinTau: 120,
    /** Contact → ghost press → press bottom (when the sound may start). */
    ghostPressAfter: 70,
    pressBottomAfter: 120,
  },
  swap: {
    brakeMs: 300,
    pop: 0.025,
    popMs: 120,
    homeMs: 560,
    sameSideLift: 0.04,
    sideOffset: 0.03,
    clearance: 0.06,
    earliestDrop: 650,
  },
  leave: { stagger: 45, glideMs: 340, sinkMs: 140, commitMs: 150 },
  relayoutMs: 400,
  /** At play speed (7.5 rev/s) a disc is drawn as its radial average: the same image every frame. */
  playSpeed: 2 * Math.PI * 7.5,
} as const;

/** The magazine slit's centre: discs rise and sink through it. */
export const SLIT_X = (DECK.slot.minX + DECK.slot.maxX) / 2;

const UP = new Vector3(0, 1, 0);
/** A half turn about the vertical: the data side towards the camera. */
const DATA_SIDE = new Quaternion().setFromAxisAngle(UP, Math.PI);

const smoothFade = (u: number): number => {
  const v = clamp01(u);
  return v * v * (3 - 2 * v);
};

export function clonePose(pose: DiscPose): DiscPose {
  return { position: pose.position.clone(), orientation: pose.orientation.clone(), scale: pose.scale };
}

export function still(pose: DiscPose, start: number, end = Number.POSITIVE_INFINITY): PoseSegment {
  const fixed = clonePose(pose);
  return { start, end, at: () => fixed };
}

/** Quadratic Bézier. */
function bezier(a: Vector3, control: Vector3, b: Vector3, u: number, target = new Vector3()): Vector3 {
  const p = a.clone().lerp(control, u);
  const q = control.clone().lerp(b, u);
  return target.copy(p.lerp(q, u));
}

/** Where a disc waits inside the radio, under the slit, data side out, centre 75 mm below the well floor. */
export function hiddenPose(): DiscPose {
  const { slot } = DECK;
  return {
    position: new Vector3(SLIT_X, slot.floorY - DISC_MOTION.rise.hiddenBelow, slot.z),
    orientation: DATA_SIDE.clone(),
    scale: DISC_MOTION.glide.scaleFrom,
  };
}

/** The top of a disc's rise: above the radio, a little towards its slot, higher for later discs. */
export function apexPose(slot: DiscSlot, order: number): DiscPose {
  const { rise } = DISC_MOTION;
  const offset = MathUtils.clamp(rise.offsetShare * (slot.position.x - SLIT_X), -rise.maxOffset, rise.maxOffset);
  return {
    position: new Vector3(SLIT_X + offset, rise.apexY + rise.apexStep * order, DECK.slot.z),
    orientation: DATA_SIDE.clone(),
    scale: DISC_MOTION.glide.scaleFrom,
  };
}

/** The pose a disc rests at in its slot. */
export function slotPose(slot: DiscSlot): DiscPose {
  return { position: slot.position.clone(), orientation: slotOrientation(slot), scale: 1 };
}

/** The pose of a disc on the turntable (before its spin). */
export function seatPose(): DiscPose {
  return { position: DECK.seat.clone(), orientation: seatOrientation(), scale: 1 };
}

/** Straight up through the slit: height eases out, the drift towards the slot comes late, once it is clear. */
export function rise(from: DiscPose, apex: DiscPose, start: number, duration: number): PoseSegment {
  return {
    start,
    end: start + duration,
    at(t) {
      const u = clamp01((t - start) / duration);
      const position = new Vector3(
        MathUtils.lerp(from.position.x, apex.position.x, u * u * u),
        MathUtils.lerp(from.position.y, apex.position.y, easeOutCubic(u)),
        MathUtils.lerp(from.position.z, apex.position.z, u),
      );
      return { position, orientation: from.orientation.clone(), scale: from.scale };
    },
  };
}

/**
 * From the apex to `slot` on a Bézier (control halfway across, 70 mm above the higher end, 35 % of the way in z),
 * flipping half a turn about the vertical between 15 % and 75 % to show the label, ending 6 mm past the slot
 * along the incoming direction (the settle springs it back).
 */
export function glide(from: DiscPose, slot: DiscSlot, start: number, duration: number): PoseSegment {
  const { glide: g, settle } = DISC_MOTION;
  const goal = slotPose(slot);
  const control = new Vector3(
    (from.position.x + goal.position.x) / 2,
    Math.max(from.position.y, goal.position.y) + g.lift,
    MathUtils.lerp(from.position.z, goal.position.z, g.depthShare),
  );
  const incoming = goal.position.clone().sub(control).normalize();
  const end = goal.position.clone().addScaledVector(incoming, settle.overshoot);
  const flipped = from.orientation.clone().multiply(DATA_SIDE);
  return {
    start,
    end: start + duration,
    at(t) {
      const u = clamp01((t - start) / duration);
      const eased = easeInOutCubic(u);
      const flip = easeInOutCubic(clamp01((u - g.flipFrom) / (g.flipTo - g.flipFrom)));
      // The turn about the disc's own vertical, unwinding the half turn it rose with.
      const orientation = flipped
        .clone()
        .slerp(goal.orientation, eased)
        .multiply(new Quaternion().setFromAxisAngle(UP, Math.PI * (1 - flip)));
      return {
        position: bezier(from.position, control, end, eased),
        orientation,
        scale: MathUtils.lerp(from.scale, 1, eased),
      };
    },
  };
}

/** The spring back from the overshoot into the slot (ζ 0.5, 3.2 Hz). */
export function settle(from: DiscPose, slot: DiscSlot, start: number): PoseSegment {
  const { settle: s } = DISC_MOTION;
  const goal = slotPose(slot);
  const offset = from.position.clone().sub(goal.position);
  return {
    start,
    end: start + s.ms,
    at(t) {
      // The spring's last few per cent fade out over its final 30 %, so it ends exactly in the slot.
      const u = clamp01((t - start) / s.ms);
      const k = springAt(1, 0, s.zeta, s.hz, (t - start) / 1000).x * (1 - smoothFade((u - 0.7) / 0.3));
      return {
        position: goal.position.clone().addScaledVector(offset, k),
        orientation: goal.orientation.clone(),
        scale: 1,
      };
    },
  };
}

/** From a live pose to a slot in a plain eased move (a re-laid shelf, a disc called back mid-flight). */
export function ease(from: DiscPose, to: DiscPose, start: number, duration: number, lift = 0): PoseSegment {
  const control = from.position
    .clone()
    .lerp(to.position, 0.5)
    .add(new Vector3(0, lift * 2, 0));
  return {
    start,
    end: start + duration,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / duration));
      return {
        position: bezier(from.position, control, to.position, u),
        orientation: from.orientation.clone().slerp(to.orientation, u),
        scale: MathUtils.lerp(from.scale, to.scale, u),
      };
    },
  };
}

/** The unit vector from `point` towards the eye: "towards the camera". */
export function towards(point: Vector3, eye: Vector3): Vector3 {
  return eye.clone().sub(point).normalize();
}

/** The pick's anticipation: a small dip and lean forward, a touch bigger (easeOutQuad). */
export function anticipate(from: DiscPose, eye: Vector3, start: number): PoseSegment {
  const { pick } = DISC_MOTION;
  const shift = towards(from.position, eye)
    .multiplyScalar(pick.forward)
    .add(new Vector3(0, -pick.dip, 0));
  return {
    start,
    end: start + pick.anticipationMs,
    at(t) {
      const u = clamp01((t - start) / pick.anticipationMs);
      const k = 1 - (1 - u) * (1 - u);
      return {
        position: from.position.clone().addScaledVector(shift, k),
        orientation: from.orientation.clone(),
        scale: MathUtils.lerp(from.scale, Math.max(from.scale, pick.scale), k),
      };
    },
  };
}

/** Share of the flight a picked disc stays upright before it starts to lie down. */
const FLAT_FROM = 0.3;

/** The point straight above the seat a disc flies to before it drops (gravity), optionally shifted sideways (a swap's waiting place). */
export function approachPoint(side = 0): Vector3 {
  return DECK.seat.clone().add(new Vector3(side, DISC_MOTION.pick.approachAbove, 0));
}

/**
 * The flight to the point above the seat: a Bézier whose control is 60 mm up and 80 mm towards the camera, so the
 * disc passes in front of the shelf; it turns flat, label up, the label's top away from the camera.
 */
export function flight(from: DiscPose, to: Vector3, eye: Vector3, start: number, duration: number): PoseSegment {
  const { pick } = DISC_MOTION;
  const control = from.position
    .clone()
    .lerp(to, 0.5)
    .add(new Vector3(0, pick.controlUp, 0))
    .addScaledVector(towards(from.position, eye), pick.controlForward);
  const flat = seatOrientation();
  return {
    start,
    end: start + duration,
    at(t) {
      const linear = clamp01((t - start) / duration);
      const u = easeInOutCubic(linear);
      // It stays upright, label to the camera, while it passes in front of the shelf, and lies down as it descends.
      const turn = easeInOutCubic(clamp01((linear - FLAT_FROM) / (1 - FLAT_FROM)));
      return {
        position: bezier(from.position, control, to, u),
        orientation: from.orientation.clone().slerp(flat, turn),
        scale: MathUtils.lerp(from.scale, 1, u),
      };
    },
  };
}

/** The drop onto the spindle (gravity: easeInQuad), then the 1.5 mm bounce off the turntable. */
export function drop(from: Vector3, start: number): PoseSegment {
  const { pick } = DISC_MOTION;
  const seat = seatPose();
  const contact = start + pick.dropMs;
  return {
    start,
    end: contact + pick.bounceMs,
    at(t) {
      if (t < contact) {
        const u = clamp01((t - start) / pick.dropMs);
        return { position: from.clone().lerp(seat.position, u * u), orientation: seat.orientation, scale: 1 };
      }
      const bounce = Math.sin(Math.PI * clamp01((t - contact) / pick.bounceMs)) * pick.bounce;
      return {
        position: seat.position.clone().addScaledVector(DECK.seatNormal, bounce),
        orientation: seat.orientation,
        scale: 1,
      };
    },
  };
}

/** The unseat: the disc pops 25 mm off the spindle (easeOutBack 1.4). */
export function unseat(from: DiscPose, start: number): PoseSegment {
  const { swap } = DISC_MOTION;
  const back = easeOutBack(1.4);
  return {
    start,
    end: start + swap.popMs,
    at(t) {
      const u = clamp01((t - start) / swap.popMs);
      return {
        position: from.position.clone().addScaledVector(DECK.seatNormal, swap.pop * back(u)),
        orientation: from.orientation.clone(),
        scale: 1,
      };
    },
  };
}

/** Home from the well: the insert path mirrored, 40 mm higher when the slot is on the incoming disc's side. */
export function flyHome(from: DiscPose, slot: DiscSlot, eye: Vector3, start: number, higher: boolean): PoseSegment {
  const { pick, swap, settle: s } = DISC_MOTION;
  const goal = slotPose(slot);
  const control = from.position
    .clone()
    .lerp(goal.position, 0.5)
    .add(new Vector3(0, pick.controlUp + (higher ? swap.sameSideLift : 0), 0))
    .addScaledVector(towards(from.position, eye), pick.controlForward);
  const incoming = goal.position.clone().sub(control).normalize();
  const end = goal.position.clone().addScaledVector(incoming, s.overshoot);
  return {
    start,
    end: start + swap.homeMs,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / swap.homeMs));
      return {
        position: bezier(from.position, control, end, u),
        orientation: from.orientation.clone().slerp(goal.orientation, u),
        scale: 1,
      };
    },
  };
}

/** Leaving: back over the slit with the flip back to the data side (340 ms), then down into it (easeInCubic, 140 ms). */
export function returnHome(from: DiscPose, apex: DiscPose, start: number): PoseSegment {
  const { leave } = DISC_MOTION;
  const hidden = hiddenPose();
  const sinkStart = start + leave.glideMs;
  const control = from.position
    .clone()
    .lerp(apex.position, 0.5)
    .add(new Vector3(0, 0.03, 0));
  return {
    start,
    end: sinkStart + leave.sinkMs,
    at(t) {
      if (t < sinkStart) {
        const u = easeInOutCubic(clamp01((t - start) / leave.glideMs));
        return {
          position: bezier(from.position, control, apex.position, u),
          orientation: from.orientation.clone().slerp(apex.orientation, u),
          scale: MathUtils.lerp(from.scale, apex.scale, u),
        };
      }
      const u = easeInCubic(clamp01((t - sinkStart) / leave.sinkMs));
      return {
        position: apex.position.clone().lerp(hidden.position, u),
        orientation: apex.orientation.clone(),
        scale: apex.scale,
      };
    },
  };
}

/** Centre-out order for the rise (k = 0 the middle disc), and its reverse, edge-in, for the return. */
export function centreOutOrder(count: number): number[] {
  const middle = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b,
  );
}

/** The delay between successive rising discs: clamp(240 / (N − 1), 30, 60) ms; warm arrivals 40 ms. */
export function riseStagger(count: number, warm: boolean): number {
  const { stagger } = DISC_MOTION;
  if (count <= 1) return 0;
  if (warm) return stagger.warm;
  return MathUtils.clamp(stagger.span / (count - 1), stagger.min, stagger.max);
}

/** Idle character of disc `index`: incommensurate bob and wobble, a spin rate and direction, seeded by index. */
export interface IdleCharacter {
  readonly bobPeriod: number;
  readonly bobPhase: number;
  readonly wobbleHz: number;
  readonly wobblePhase: number;
  /** rad/s, alternating direction. */
  readonly spin: number;
}

function seeded(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const IDLE = { bob: 0.0035, wobble: MathUtils.degToRad(1.5), parallax: 0.01 } as const;

export function idleCharacter(index: number): IdleCharacter {
  const direction = index % 2 === 0 ? 1 : -1;
  return {
    bobPeriod: 2800 + 800 * seeded(index, 1),
    bobPhase: 2 * Math.PI * seeded(index, 2),
    wobbleHz: 0.35 + 0.1 * seeded(index, 3),
    wobblePhase: 2 * Math.PI * seeded(index, 4),
    spin: direction * 2 * Math.PI * (0.12 + 0.06 * seeded(index, 5)),
  };
}

/** The float's offset at `t` scaled by `amplitude` (0 resting … 1 attentive): a bob in y and a wobble quaternion. */
export function idleOffset(character: IdleCharacter, t: number, amplitude: number): { y: number; wobble: Quaternion } {
  const y = IDLE.bob * amplitude * Math.sin((2 * Math.PI * t) / character.bobPeriod + character.bobPhase);
  const angle =
    IDLE.wobble * amplitude * Math.sin((2 * Math.PI * character.wobbleHz * t) / 1000 + character.wobblePhase);
  const axis = new Vector3(Math.cos(character.wobblePhase), 0, Math.sin(character.wobblePhase)).normalize();
  return { y, wobble: new Quaternion().setFromAxisAngle(axis, angle) };
}

/** The attention pose for a disc resting in `slot`, for an eye at `eye`: forward, up, bigger, facing the eye. */
export function attentionPose(slot: DiscSlot, eye: Vector3): DiscPose {
  const position = slot.position
    .clone()
    .addScaledVector(eye.clone().sub(slot.position).normalize(), ATTENTION.towardsCamera)
    .add(new Vector3(0, ATTENTION.up, 0));
  const facing = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), eye.clone().sub(position).normalize());
  return { position, orientation: facing, scale: ATTENTION.scale };
}

/** The lowest point of a disc in a pose (for "below the radio top" and clearance checks). */
export function lowestY(pose: DiscPose): number {
  const normal = new Vector3(0, 0, 1).applyQuaternion(pose.orientation);
  // The disc's extent along y: r × the length of the in-plane component of y.
  const inPlane = Math.sqrt(Math.max(0, 1 - normal.y * normal.y));
  return pose.position.y - DISC_RADIUS * pose.scale * inPlane;
}
