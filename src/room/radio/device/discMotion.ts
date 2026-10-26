import { MathUtils, Quaternion, Vector3 } from 'three';
import { clamp01, easeInCubic, easeInOutCubic, easeOutCubic, hermiteEase } from '../../motion/easing';
import { DISC_RADIUS, type DiscSlot } from '../discLayout';
import { slotOrientation } from '../radioFraming';
import { ATTENTION, DECK, seatOrientation } from './deckLayout';
import { springAt } from './springs';

/**
 * The paths a CD takes (docs/ROOM.md › The CD player), as pure functions of time, each starting from a live pose so
 * a retarget never jumps. Every path is drawn so that no disc passes through another (choreography.ts schedules them
 * so; discContact.ts and the storyboard sweep check it):
 *
 * - up out of the magazine slot like toast, in the slot's own plane until it is clear of the lips, then forward into
 *   a lane of its own so the next disc comes up behind it; across to its slot within that lane, upright like every
 *   disc in the other lanes (parallel discs in different lanes cannot touch); and forward into its slot, turning over
 *   to show its label there, where no other disc ever passes;
 * - into the player: out of the shelf towards the camera, down in front of the radio while it lies flat, a slide
 *   back over the seat and the drop;
 * - out of the player: it lifts off the spindle and stands up, label to the camera, and goes home behind the shelf,
 *   so it never meets the disc coming in in front;
 * - back home from mid-flight in front of the shelf; and when the visitor leaves, the arrival backwards: out of the
 *   slot into a lane, turning back to the data side; across to the slot it rises through; and down it, one disc after
 *   another, each once the lanes between it and the slot are empty. A disc leaving the player as the visitor leaves
 *   takes the short way home instead: it stands up, backs into the slot's plane under the lanes and goes down it.
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
    ms: 200,
    warmMs: 180,
    hiddenBelow: 0.075,
    apexY: 1.205,
    offsetShare: 0.22,
    maxOffset: 0.045,
    /**
     * A rising disc keeps to the slot's plane until its lower edge is this high (clear of the slot's lips and of a
     * disc lying in the player), then moves into its lane: `lane` in front of the slot for the last disc up, and
     * `laneStep` further for each disc before it, so every disc comes up behind the one before.
     */
    clearY: 1.053,
    lane: 0.03,
    laneStep: 0.01,
    /** Share of the rise it takes to get into its lane, once clear (quick: the next disc is right behind). */
    laneShare: 0.2,
  },
  /** Rising discs spin about their own axis at this speed (rad/s). */
  riseSpin: 14,
  /** Across to its slot within its lane, upright and a little smaller (ms, m). */
  across: { ms: 320, warmMs: 280, lift: 0.05 },
  /** Forward into its slot, turning over to show its label and hanging as the slot does. */
  into: { ms: 240, warmMs: 220 },
  scaleFrom: 0.94,
  glideSpinTau: 350,
  settle: { overshoot: 0.006, zeta: 0.5, hz: 3.2, ms: 300 },
  /**
   * Between successive rising discs: clamp(240 / (N − 1), 55, 60) ms. No shorter: a disc must be in its lane before
   * the next one's top reaches its lower edge, and the next one rises faster than it (its ease is further back).
   */
  stagger: { min: 55, max: 60, span: 240, warm: 55 },
  pick: {
    /** The wind-up: a quick dip and lean forward, a touch bigger (a centimetre of travel in its 90 ms). */
    anticipationMs: 90,
    dip: 0.008,
    forward: 0.01,
    scale: 1.08,
    /**
     * Out of the shelf towards the camera and up, then down in front of the radio. It leaves at `leaveSlope` (the
     * wind-up was the ease-in) and keeps its pick scale until `shrinkFrom` of the way, so the move towards the camera
     * reads at once instead of being cancelled by the disc shrinking back.
     */
    flightMs: 400,
    outward: 0.1,
    lift: 0.035,
    leaveSlope: 1.6,
    /**
     * The wind-up ends at rest at the bottom of its dip, so the flight builds its leaving speed over its first
     * `launchMs` (a constant push) instead of jumping to it: one speed where the two meet, no jolt.
     */
    launchMs: 60,
    shrinkFrom: 0.35,
    /** Shares of the flight: upright until the first, flat from the second (low, in front of the radio). */
    flatFrom: 0.4,
    flatBy: 0.9,
    /** Share of the way out before it starts across. */
    acrossFrom: 0.2,
    /** The point it comes down to, flat: this far in front of the seat, and as high above it as the approach. */
    frontOfSeat: 0.16,
    approachAbove: 0.093,
    /**
     * When the well is free it glides through the front point without stopping: the flight's last control point
     * lies `glideIn` in front of it (so it arrives moving straight back towards the seat) and the slide takes its
     * speed on, leaving at `glideSlope` and easing out over the seat.
     */
    glideIn: 0.08,
    glideSlope: 1,
    /** Back over the seat, flat, under the discs hanging above it. */
    slideMs: 150,
    /** The fall from the approach onto the spindle: 93 mm in 145 ms is about g. */
    dropMs: 145,
    /**
     * The drop begins this long before the slide has eased out over the seat, so the disc settles onto the spindle
     * as it lines up instead of hanging still above it first. It has fallen under a centimetre by then.
     */
    dropLeadMs: 35,
    bounce: 0.0015,
    bounceMs: 50,
    spinTau: 120,
    /**
     * After the bounce the radio presses its own ▷II, as a beat of its own: down `pressAfter` ms after contact
     * (the bounce is over), at the bottom `pressDownMs` later (the sound may start), held `pressHoldMs`.
     */
    pressAfter: 60,
    pressDownMs: 90,
    pressHoldMs: 150,
  },
  swap: {
    brakeMs: 220,
    /** The outgoing disc lifts off the spindle and stands up, its label to the camera, in this long, this high. */
    standMs: 220,
    standLift: 0.055,
    /**
     * Then home behind the shelf: back to a plane this far behind the shelf's deepest disc edge (never deeper than
     * `deepestExitZ`, clear of the open lid), up and across, the insert's length.
     */
    exitZ: -2.088,
    exitBehind: 0.014,
    deepestExitZ: -2.132,
    /** Back into it (and up), across it, into its slot. */
    exitLift: 0.03,
    backMs: 140,
    acrossMs: 300,
    intoMs: 220,
    /** The incoming disc slides over the seat once the outgoing one's lower edge is this far above the slide. */
    clearance: 0.012,
    /** It sets off so as to wait no longer than this in front of the radio, flat, for the well to clear. */
    aimMs: 80,
    /**
     * A wait in front of the radio this short or shorter is flown instead: the flight takes that much longer and
     * glides through the front point as the well clears, so the incoming disc never stops there.
     */
    glideWaitMs: 120,
  },
  /** A disc called back mid-flight in front of the shelf goes home the way it came, in front. */
  home: { ms: 520, forward: 0.15, outward: 0.08 },
  leave: {
    stagger: 45,
    /** Out of the slot into its lane (turning back to the data side), then across to the slot it sinks through. */
    outMs: 200,
    acrossMs: 260,
    sinkMs: 130,
    /** The height and lanes above the slot discs wait in before they sink, the first one back nearest the slot. */
    hoverY: 1.22,
    lane: 0.015,
    laneStep: 0.01,
    /** A disc may go down the slot this long after the one before (they share its plane). */
    sinkGap: 50,
    /** The lid starts to close this long after the last disc starts down the slot. */
    lidAfterSinkMs: 0,
    /**
     * The lid should start down within this long of the request (the camera lands at 1100 ms, the close and its
     * rebound take 410): a leave that starts late (discs still arriving) or a long one (many discs) is paced up to
     * fit, its moves down to `minPace` of their length (the sink keeps its own, so the slot is never shared closer).
     */
    lidStartBy: 690,
    minPace: 0.65,
  },
  /**
   * When the visitor leaves mid-pick, the disc going in commits: what is left of its way plays in at most `ms` (the
   * part before the slide in `preMs`, the slide and the drop in `postMs`) once the well is clear.
   */
  commit: { ms: 200, preMs: 110, postMs: 90 },
  /** And a disc leaving the player brakes in at most `brakeMs`, stands up and backs into the slot's plane (`backMs`). */
  slit: { brakeMs: 120, backMs: 140 },
  /** A disc whose slot moved (a resize, a rotation) glides to the new one. */
  relayoutMs: 400,
  /** At play speed (7.5 rev/s) a disc is drawn as its radial average: the same image every frame. */
  playSpeed: 2 * Math.PI * 7.5,
} as const;

/** The magazine slit's centre: discs rise and sink through it. */
export const SLIT_X = (DECK.slot.minX + DECK.slot.maxX) / 2;

const UP = new Vector3(0, 1, 0);
const FRONT = new Vector3(0, 0, 1);
/** A half turn about the vertical: the data side towards the camera. */
const DATA_SIDE = new Quaternion().setFromAxisAngle(UP, Math.PI);

const smooth = (u: number): number => {
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

/** Cubic Bézier. */
function cubic(a: Vector3, b: Vector3, c: Vector3, d: Vector3, u: number, target = new Vector3()): Vector3 {
  const v = 1 - u;
  return target
    .copy(a)
    .multiplyScalar(v * v * v)
    .addScaledVector(b, 3 * v * v * u)
    .addScaledVector(c, 3 * v * u * u)
    .addScaledVector(d, u * u * u);
}

/** The unit vector from `point` towards the eye: "towards the camera". */
export function towards(point: Vector3, eye: Vector3): Vector3 {
  return eye.clone().sub(point).normalize();
}

/**
 * Out of the shelf towards the camera without going sideways: where the camera stands to one side (trucked clear of
 * the lava lamp), straight at it would take a disc across its neighbour.
 */
export function outOfShelf(point: Vector3, eye: Vector3): Vector3 {
  return towards(point, eye).setX(0).normalize();
}

/** Where a disc waits inside the radio, under the slit, data side out, centre 75 mm below the well floor. */
export function hiddenPose(): DiscPose {
  const { slot } = DECK;
  return {
    position: new Vector3(SLIT_X, slot.floorY - DISC_MOTION.rise.hiddenBelow, slot.z),
    orientation: DATA_SIDE.clone(),
    scale: DISC_MOTION.scaleFrom,
  };
}

/** Where above the slot a disc bound for (or from) `slot` hangs in `lane`: a little towards its slot. */
function aboveSlot(slot: DiscSlot, y: number, lane: number): DiscPose {
  const { rise } = DISC_MOTION;
  const offset = MathUtils.clamp(rise.offsetShare * (slot.position.x - SLIT_X), -rise.maxOffset, rise.maxOffset);
  return {
    position: new Vector3(SLIT_X + offset, y, DECK.slot.z + lane),
    orientation: DATA_SIDE.clone(),
    scale: DISC_MOTION.scaleFrom,
  };
}

/** The top of a disc's rise, in its lane. */
export function apexPose(slot: DiscSlot, lane: number): DiscPose {
  return aboveSlot(slot, DISC_MOTION.rise.apexY, lane);
}

/** The lane rising disc `order` of `count` takes once clear of the slot: the first up is furthest forward. */
export function riseLane(order: number, count: number): number {
  const { lane, laneStep } = DISC_MOTION.rise;
  return lane + laneStep * Math.max(0, count - 1 - order);
}

/** The pose a disc rests at in its slot. */
export function slotPose(slot: DiscSlot): DiscPose {
  return { position: slot.position.clone(), orientation: slotOrientation(slot), scale: 1 };
}

/** The pose of a disc on the turntable (before its spin). */
export function seatPose(): DiscPose {
  return { position: DECK.seat.clone(), orientation: seatOrientation(), scale: 1 };
}

/**
 * Straight up through the slit, height easing out like toast. It stays in the slit's plane until its lower edge
 * clears `clearY`, then moves forward into its lane; the drift towards its slot comes late, once it is clear.
 */
export function rise(from: DiscPose, apex: DiscPose, start: number, duration: number): PoseSegment {
  const halfHeight = DISC_RADIUS * from.scale;
  const climb = apex.position.y - from.position.y;
  const share = climb > 0 ? clamp01((DISC_MOTION.rise.clearY + halfHeight - from.position.y) / climb) : 0;
  // The time share at which easeOutCubic reaches `share` of the climb.
  const clear = 1 - Math.cbrt(1 - share);
  return {
    start,
    end: start + duration,
    at(t) {
      const u = clamp01((t - start) / duration);
      const forward = clear >= 1 ? 0 : smooth((u - clear) / DISC_MOTION.rise.laneShare);
      const position = new Vector3(
        MathUtils.lerp(from.position.x, apex.position.x, u * u * u),
        MathUtils.lerp(from.position.y, apex.position.y, easeOutCubic(u)),
        MathUtils.lerp(from.position.z, apex.position.z, forward),
      );
      return { position, orientation: from.orientation.clone(), scale: from.scale };
    },
  };
}

/**
 * Across within its lane (its depth never changes) to the point behind or before its slot, upright, data side out:
 * every disc in another lane is parallel to it, so none can touch it.
 */
export function across(
  from: DiscPose,
  to: { readonly x: number; readonly y: number },
  start: number,
  duration: number,
) {
  const target = new Vector3(to.x, to.y, from.position.z);
  const control = from.position
    .clone()
    .lerp(target, 0.5)
    .setY(Math.max(from.position.y, to.y) + DISC_MOTION.across.lift);
  return {
    start,
    end: start + duration,
    at(t: number): DiscPose {
      const u = easeInOutCubic(clamp01((t - start) / duration));
      return {
        position: bezier(from.position, control, target, u),
        orientation: from.orientation.clone(),
        scale: from.scale,
      };
    },
  } satisfies PoseSegment;
}

/**
 * From its lane straight into its slot, turning over (a half turn about its own vertical) to show its label and
 * hanging as the slot does; it ends 6 mm past the slot (the settle springs it back). It turns where no other disc
 * passes: in front of or behind its own slot, whose neighbours hang a pitch (135 mm, more than two discs) away.
 */
export function into(from: DiscPose, slot: DiscSlot, start: number, duration: number, turnOver = true): PoseSegment {
  const goal = slotPose(slot);
  const way = Math.sign(goal.position.z - from.position.z) || 1;
  const end = goal.position.clone().add(new Vector3(0, 0, way * DISC_MOTION.settle.overshoot));
  // Label out from the start, the half turn unwound as it goes in (or no turn: a disc coming home label out).
  const upright = turnOver ? from.orientation.clone().multiply(DATA_SIDE) : from.orientation.clone();
  return {
    start,
    end: start + duration,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / duration));
      const orientation = upright.clone().slerp(goal.orientation, u);
      if (turnOver) orientation.multiply(new Quaternion().setFromAxisAngle(UP, Math.PI * (1 - u)));
      return {
        position: from.position.clone().lerp(end, u),
        orientation,
        scale: MathUtils.lerp(from.scale, 1, u),
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
      const k = springAt(1, 0, s.zeta, s.hz, (t - start) / 1000).x * (1 - smooth((u - 0.7) / 0.3));
      return {
        position: goal.position.clone().addScaledVector(offset, k),
        orientation: goal.orientation.clone(),
        scale: 1,
      };
    },
  };
}

/**
 * Leaving: from where it floats in its slot back into its lane, turning back to the data side and upright (into,
 * backwards). Its column is its own: the discs nearer the slot have already gone, the further ones wait their turn.
 */
export function outOf(from: DiscPose, slot: DiscSlot, lane: number, start: number, duration: number): PoseSegment {
  const target = new Vector3(slot.position.x, slot.position.y, DECK.slot.z + lane);
  const label = from.orientation.clone();
  return {
    start,
    end: start + duration,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / duration));
      // Unhang to upright and turn the half turn back, about its own vertical.
      const orientation = label
        .clone()
        .slerp(new Quaternion(), u)
        .multiply(new Quaternion().setFromAxisAngle(UP, Math.PI * u));
      return {
        position: from.position.clone().lerp(target, u),
        orientation,
        scale: MathUtils.lerp(from.scale, DISC_MOTION.scaleFrom, u),
      };
    },
  };
}

/** From a live pose to another in a plain eased move (a re-laid shelf), bowing `bow` (m) off the line at its middle. */
export function ease(from: DiscPose, to: DiscPose, start: number, duration: number, bow?: Vector3): PoseSegment {
  const control = from.position.clone().lerp(to.position, 0.5);
  if (bow) control.addScaledVector(bow, 2);
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

/** The point straight above the seat a disc slides to before it drops (gravity), optionally shifted sideways. */
export function approachPoint(side = 0): Vector3 {
  return DECK.seat.clone().add(new Vector3(side, DISC_MOTION.pick.approachAbove, 0));
}

/** The point in front of the radio, as high as the approach, a picked disc comes down to, flat. */
export function frontPoint(side = 0): Vector3 {
  return approachPoint(side).addScaledVector(FRONT, DISC_MOTION.pick.frontOfSeat);
}

/** A disc lying on the turntable, label up (the label's top away from the camera). */
const FLAT = seatOrientation();

/**
 * The flight's slope on arrival at the front point that makes its speed there the slide's starting speed: the
 * cubic's end tangent is 3 · glideIn per unit of `u`, the slide's start is glideSlope · frontOfSeat per slideMs.
 */
export function glideArrivalSlope(duration: number = DISC_MOTION.pick.flightMs): number {
  const { pick } = DISC_MOTION;
  return (pick.glideSlope * pick.frontOfSeat * duration) / (3 * pick.glideIn * pick.slideMs);
}

/**
 * The flight's own clock, 0 → 1: from rest it speeds up evenly over the first `launch` of it (a share), then runs
 * evenly, `1 / (1 − launch / 2)` as fast as a plain clock (so it still ends at 1, on time).
 */
export function launchWarp(x: number, launch: number): number {
  if (launch <= 0) return x;
  const warped = x < launch ? (x * x) / (2 * launch) : x - launch / 2;
  return warped / (1 - launch / 2);
}

/**
 * The flight from the shelf to the front point: out towards the camera and up, then down in front of the radio,
 * upright (label to the camera) for its first 40 %, flat by 90 %, so it turns where nothing hangs. With `glide` the
 * well is free: it arrives moving straight back towards the seat at the slide's starting speed, one curve from the
 * shelf over the seat. Without, it lands softly on the front point and waits there.
 */
export function insertFlight(
  from: DiscPose,
  eye: Vector3,
  start: number,
  duration: number,
  glide: boolean,
  side = 0,
): PoseSegment {
  const { pick } = DISC_MOTION;
  const front = frontPoint(side);
  const out = from.position
    .clone()
    .addScaledVector(outOfShelf(from.position, eye), pick.outward)
    .add(new Vector3(0, pick.lift, 0));
  // Out and down onto the front point; across (on its own timing) only once it is out, so it never slides sideways
  // along the shelf. Gliding, it comes in level from in front of the point; landing, from above and in front of it.
  const above = glide
    ? front.clone().addScaledVector(FRONT, pick.glideIn).setX(from.position.x)
    : new Vector3(from.position.x, front.y + 0.07, front.z + 0.05);
  const launch = clamp01(pick.launchMs / duration);
  // The warp runs its last stretch 1 / (1 − launch / 2) as fast, so the arrival slope is scaled back by as much.
  const arrival = glide ? glideArrivalSlope(duration) * (1 - launch / 2) : 0;
  return {
    start,
    end: start + duration,
    at(t) {
      const linear = clamp01((t - start) / duration);
      // The anticipation was the wind-up: it leaves from rest, up to its leaving speed within launchMs.
      const u = hermiteEase(launchWarp(linear, launch), pick.leaveSlope, arrival);
      const turn = easeInOutCubic(clamp01((linear - pick.flatFrom) / (pick.flatBy - pick.flatFrom)));
      const position = cubic(from.position, out, above, front, u);
      const acrossShare = clamp01((u - pick.acrossFrom) / (1 - pick.acrossFrom));
      position.x = MathUtils.lerp(from.position.x, front.x, acrossShare * acrossShare * (3 - 2 * acrossShare));
      const shrink = clamp01((u - pick.shrinkFrom) / (1 - pick.shrinkFrom));
      return {
        position,
        orientation: from.orientation.clone().slerp(FLAT, turn),
        scale: MathUtils.lerp(from.scale, 1, shrink * shrink * (3 - 2 * shrink)),
      };
    },
  };
}

/**
 * Flat, from the front point back over the seat, under the discs hanging above it. With `glide` it takes the
 * flight's speed on and eases out over the seat; without, it sets off from rest.
 */
export function slide(side: number, start: number, glide: boolean): PoseSegment {
  const { pick } = DISC_MOTION;
  const from = frontPoint(side);
  const to = approachPoint(side);
  const leave = glide ? pick.glideSlope : 0;
  return {
    start,
    end: start + pick.slideMs,
    at(t) {
      const u = hermiteEase(clamp01((t - start) / pick.slideMs), leave, 0);
      return { position: from.clone().lerp(to, u), orientation: FLAT.clone(), scale: 1 };
    },
  };
}

/**
 * The drop onto the spindle (gravity: easeInQuad), then the 1.5 mm bounce off the turntable. With `carry` (the
 * slide, still easing out over the seat) it falls from wherever the slide has it, so the two moves overlap.
 */
export function drop(from: Vector3, start: number, carry?: PoseSegment): PoseSegment {
  const { pick } = DISC_MOTION;
  const seat = seatPose();
  const contact = start + pick.dropMs;
  return {
    start,
    end: contact + pick.bounceMs,
    at(t) {
      if (t < contact) {
        const u = clamp01((t - start) / pick.dropMs);
        const above = carry && t < carry.end ? carry.at(t).position : from.clone();
        return { position: above.lerp(seat.position, u * u), orientation: seat.orientation, scale: 1 };
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

/** Upright over the seat, the label to the camera (along the well floor's forward direction). */
function standingOrientation(): Quaternion {
  const normal = DECK.seatNormal;
  const forward = FRONT.clone().addScaledVector(normal, -FRONT.dot(normal)).normalize();
  return new Quaternion().setFromUnitVectors(normal, forward).multiply(FLAT);
}

/**
 * Out of the player: it lifts off the spindle (fast at first) and stands up, label to the camera, turning about its
 * own centre high enough that its front edge stays clear of the well floor.
 */
export function standUp(start: number): PoseSegment {
  const { swap } = DISC_MOTION;
  const seat = seatPose();
  const upright = standingOrientation();
  return {
    start,
    end: start + swap.standMs,
    at(t) {
      const u = clamp01((t - start) / swap.standMs);
      return {
        position: seat.position.clone().addScaledVector(DECK.seatNormal, swap.standLift * easeOutCubic(u)),
        orientation: seat.orientation.clone().slerp(upright, easeInOutCubic(clamp01((u - 0.15) / 0.85))),
        scale: 1,
      };
    },
  };
}

/** The plane a disc leaving the player goes home in: behind every disc on the shelf, in front of the open lid. */
export function exitPlane(slots: readonly DiscSlot[]): number {
  const { swap } = DISC_MOTION;
  let deepest = swap.exitZ + swap.exitBehind;
  for (const slot of slots) deepest = Math.min(deepest, slot.position.z - DISC_RADIUS * Math.sin(slot.tilt));
  return Math.max(swap.deepestExitZ, deepest - swap.exitBehind);
}

/**
 * Home from the well behind the shelf, the first of three moves (then across within the exit plane and into its slot,
 * as a rising disc goes): back to the exit plane, behind every disc on the shelf, and a little up, upright.
 */
export function backToExit(from: DiscPose, exitZ: number, start: number): PoseSegment {
  const { swap } = DISC_MOTION;
  const to = new Vector3(from.position.x, from.position.y + swap.exitLift, exitZ);
  return {
    start,
    end: start + swap.backMs,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / swap.backMs));
      return { position: from.position.clone().lerp(to, u), orientation: from.orientation.clone(), scale: 1 };
    },
  };
}

/** Called back from the slide: flat, back out from under the shelf to the front point (the slide in reverse). */
export function backOut(from: DiscPose, start: number): PoseSegment {
  const { pick } = DISC_MOTION;
  const front = frontPoint();
  const duration = pick.slideMs * clamp01(front.distanceTo(from.position) / pick.frontOfSeat);
  return {
    start,
    end: start + duration,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / duration));
      return { position: from.position.clone().lerp(front, u), orientation: FLAT.clone(), scale: 1 };
    },
  };
}

/** Whether a disc is under the shelf on its way in (flat, behind the front point): it backs out first. */
export function underShelf(pose: DiscPose): boolean {
  return pose.position.z < frontPoint().z - 0.002 && new Vector3(0, 0, 1).applyQuaternion(pose.orientation).y > 0.9;
}

/**
 * Home from wherever an insert was called off, in front of the shelf (from the slide it backs out first): out
 * towards the camera, standing up as it comes, then up in front of its slot and in, from the camera's side or, with
 * `straight`, straight from the front (the way the rise puts a disc into its slot: past the neighbours in front of it
 * in a deep arc rather than across them).
 */
export function homeInFront(
  from: DiscPose,
  slot: DiscSlot,
  eye: Vector3,
  start: number,
  straight = false,
): PoseSegment {
  const { home, settle: s } = DISC_MOTION;
  const goal = slotPose(slot);
  const out = from.position.clone().addScaledVector(FRONT, home.forward);
  const before = goal.position.clone().addScaledVector(straight ? FRONT : outOfShelf(goal.position, eye), home.outward);
  const incoming = goal.position.clone().sub(before).normalize();
  const end = goal.position.clone().addScaledVector(incoming, s.overshoot);
  return {
    start,
    end: start + home.ms,
    at(t) {
      const linear = clamp01((t - start) / home.ms);
      const u = easeInOutCubic(linear);
      return {
        position: cubic(from.position, out, before, end, u),
        orientation: from.orientation.clone().slerp(goal.orientation, easeInOutCubic(clamp01(linear / 0.6))),
        scale: MathUtils.lerp(from.scale, 1, u),
      };
    },
  };
}

/**
 * The short way home out of the player, as the visitor leaves: from standing over the seat straight back into the
 * slot's plane at the same height (under the lanes the shelf's discs wait in), upright, label to the camera, then
 * down it (`sink`). The slot is right behind the seat, so the well is clear for the disc coming in once it is there.
 */
export function toSlit(from: DiscPose, start: number, duration: number): PoseSegment {
  const target = new Vector3(SLIT_X, from.position.y, DECK.slot.z);
  const upright = new Quaternion();
  return {
    start,
    end: start + duration,
    at(t) {
      const u = easeInOutCubic(clamp01((t - start) / duration));
      return {
        position: from.position.clone().lerp(target, u),
        orientation: from.orientation.clone().slerp(upright, u),
        scale: from.scale,
      };
    },
  };
}

/** Where a disc going home waits above the slot before it sinks, data side out, in its lane. */
export function hoverPose(slot: DiscSlot, lane: number): DiscPose {
  return aboveSlot(slot, DISC_MOTION.leave.hoverY, lane);
}

/** The lane the `order`-th disc home takes: the first one back nearest the slot's plane, so nothing is between. */
export function leaveLane(order: number): number {
  const { lane, laneStep } = DISC_MOTION.leave;
  return lane + laneStep * order;
}

/** Down the slot (easeInCubic): back into its plane and over its middle well before the lower edge reaches it. */
export function sink(from: DiscPose, start: number, duration: number = DISC_MOTION.leave.sinkMs): PoseSegment {
  const hidden = hiddenPose();
  return {
    start,
    end: start + duration,
    at(t) {
      const u = clamp01((t - start) / duration);
      const into = smooth(u / 0.7);
      return {
        position: new Vector3(
          MathUtils.lerp(from.position.x, hidden.position.x, into),
          MathUtils.lerp(from.position.y, hidden.position.y, easeInCubic(u)),
          MathUtils.lerp(from.position.z, hidden.position.z, into),
        ),
        orientation: from.orientation.clone(),
        scale: from.scale,
      };
    },
  };
}

/**
 * The rise's order: the disc whose slot is furthest from the slot it rises through first, so a disc never glides past
 * a slot already taken, and (the slots being symmetric) one to the left, one to the right by turns. Ties left first.
 */
export function riseOrder(slots: readonly DiscSlot[]): number[] {
  const origin = new Vector3(SLIT_X, DISC_MOTION.rise.apexY, DECK.slot.z);
  const distance = slots.map((slot) => Math.round(slot.position.distanceTo(origin) * 1e4));
  return slots.map((_, i) => i).sort((a, b) => (distance[b] ?? 0) - (distance[a] ?? 0) || a - b);
}

/** The delay between successive rising discs: clamp(240 / (N − 1), 55, 60) ms; warm arrivals 55 ms. */
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
