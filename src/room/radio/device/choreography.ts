import { Quaternion, Vector3 } from 'three';
import { clamp01 } from '../../motion/easing';
import type { DiscSlot } from '../discLayout';
import { DISC_RADIUS } from '../discLayout';
import type { RadioCue, RadioKey, Transport } from '../RadioDeck';
import { slotOrientation } from '../radioFraming';
import { DECK } from './deckLayout';
import { discsTouch } from './discContact';
import {
  across,
  anticipate,
  apexPose,
  approachPoint,
  attentionPose,
  backOut,
  backToExit,
  clonePose,
  DISC_MOTION,
  type DiscPose,
  drop,
  ease,
  exitPlane,
  hiddenPose,
  homeInFront,
  hoverPose,
  IDLE,
  type IdleCharacter,
  idleCharacter,
  idleOffset,
  insertFlight,
  into,
  leaveLane,
  lowestY,
  outOf,
  type PoseSegment,
  rise,
  riseLane,
  riseOrder,
  riseStagger,
  SLIT_X,
  seatPose,
  settle,
  sink,
  slide,
  slotPose,
  standUp,
  still,
  toSlit,
  underShelf,
} from './discMotion';
import { BLUR_FROM } from './discShader';
import { type KeyPress, keyMoving, keyTravel, releaseStart } from './keyMotion';
import { closeFrom, LID_DISC_GATE_DEGREES, type LidPlan, lidAt, lidMoments, lidReaches, openFrom } from './lidMotion';
import {
  type SpinSegment,
  type SpinTrack,
  Spring,
  spinAt,
  spinChanging,
  spinThen,
  uprightTarget,
  uprightTurn,
} from './springs';
import { hurry, hurryWithin, peakSpeed, warpSegments } from './timeWarp';

/**
 * The CD player's storyboard as data (docs/ROOM.md › The CD player): events in (the approach, the landing, the
 * leave, the app's deck state, attention, key presses) and, at any time `t`, the pose of every part plus the
 * mechanical moments that happened since the last `advance`. Every part is a pure function of time between events;
 * an event retargets from the parts' live poses, so the latest request always wins and nothing ever jumps.
 *
 * No disc ever passes through another. The paths are drawn for it (discMotion.ts) and this schedules them so: the
 * discs rise one behind the other, each into a lane of its own, the furthest slot first, so a disc never passes a
 * slot already taken and turns over only in front of its own; a disc going into the player comes in front of the
 * shelf and slides over the seat only once the disc leaving it (behind the shelf) is clear; one called back from in
 * front goes home before the next leaves the shelf; and the discs going home leave nearest first and take turns down
 * the slot. The storyboard sweep (choreography.contact.test.ts) holds it to that.
 *
 * No scene, no renderer, no clock: RadioDevice samples it each frame, tests at any instant.
 */

export interface ChoreographyOptions {
  /** How long the camera's reduced-motion fade lasts before the cut (CameraRig's REDUCED_FADE_MS). */
  readonly reducedFadeMs: number;
  /** Where the camera rests at the radio: the attention pose and the flights face it. */
  readonly eye: () => Vector3;
  readonly reducedMotion: () => boolean;
  /** The slow tier: no float, and every arrival takes the short (warm) timings. */
  readonly slow: () => boolean;
}

export type DiscPhase =
  | 'stowed'
  | 'rising'
  | 'floating'
  | 'inserting'
  | 'dropping'
  | 'seated'
  /** Lifting off the spindle and standing up. */
  | 'unseating'
  /** Out of the player, on its way home behind the shelf. */
  | 'exiting'
  /** Called back mid-insert, on its way home in front of the shelf. */
  | 'homing'
  | 'returning';

type Rest = 'stowed' | 'floating' | 'seated';

interface PhasedSegment extends PoseSegment {
  readonly phase: DiscPhase;
}

/** A mechanical moment: a cue to sound, or the loaded disc being seated (start the sound). */
export interface Moment {
  readonly at: number;
  /** The part that owns it; a retarget of that part cancels its future moments. */
  readonly owner: string;
  readonly cue?: RadioCue;
  readonly order?: number;
  /** The disc a cue is about (its stereo position), or that was seated. */
  readonly disc?: string;
  readonly seated?: true;
  /** Where the sound comes from when it is not a disc. */
  readonly part?: 'lid' | 'keys';
}

/** A brief offset of a disc: in over `attack`, held, out over `release` (both halves of `duration` for a dip). */
interface Bump {
  readonly start: number;
  readonly duration: number;
  readonly offset: Vector3;
  readonly attack: number;
  readonly release: number;
}

/** How much of a bump applies at `t`: eased in, held, eased out. */
export function bumpWeight(bump: Bump, t: number): number {
  const elapsed = t - bump.start;
  if (elapsed <= 0 || elapsed >= bump.duration) return 0;
  const smooth = (u: number) => u * u * (3 - 2 * u);
  return smooth(Math.min(1, elapsed / bump.attack)) * smooth(Math.min(1, (bump.duration - elapsed) / bump.release));
}

interface Insert {
  /** When it is in front of the radio (its flight done) and starts over the seat; null when it was never out. */
  readonly flown: number;
  readonly slideStart: number | null;
  readonly dropStart: number;
  readonly contact: number;
  /** ▷II's press bottom: the sound may start. */
  readonly bottom: number;
}

/** A disc's way out of the radio, kept so a disc picked on it (and then let go) can still turn into its slot. */
interface Climb {
  /** Up out of the slot and across to its column in front of its own slot (the same segments as in its plan). */
  readonly way: readonly PhasedSegment[];
  /** Its turn into the slot from there. */
  readonly intoMs: number;
  /** Its place in the rise, for the flip's sound. */
  readonly order: number;
}

interface DiscTrack {
  /** Renamed only when a new collection's disc takes it over ({@link discHeirs}). */
  id: string;
  index: number;
  slot: DiscSlot;
  readonly character: IdleCharacter;
  segments: PhasedSegment[];
  rest: Rest;
  spin: SpinTrack;
  insert: Insert | null;
  climb: Climb | null;
  /** When it set off home on the leave (its turn, then the glide), for a visitor turning back. */
  setOff: number | null;
  readonly attention: Spring;
  readonly lean: Spring;
  readonly tiltX: Spring;
  readonly tiltY: Spring;
  bumps: Bump[];
}

/** One disc as drawn at time t. */
export interface DiscSample {
  readonly id: string;
  readonly phase: DiscPhase;
  readonly position: Vector3;
  /** Including its spin about its own axis. */
  readonly orientation: Quaternion;
  readonly scale: number;
  /** Spin speed (rad/s), for the motion blur. */
  readonly omega: number;
  /** Not hidden inside the radio. */
  readonly visible: boolean;
}

export interface KeySample {
  /** Which rocker half is pressed and how far (0–1, slightly below 0 in the release overshoot). */
  readonly rockerKey: 'play-pause' | 'stop' | null;
  readonly rockerTravel: number;
  readonly previous: number;
  readonly next: number;
}

export interface ChoreographySample {
  readonly lid: number;
  readonly discs: readonly DiscSample[];
  readonly keys: KeySample;
  /** Something animates at display rate: a frame is needed. */
  readonly moving: boolean;
  /** The floating discs drift (bob, wobble, spin, parallax): ambient frames are needed (≤ 30/s). */
  readonly ambient: boolean;
}

/** The float rests this long after the last input, easing out over REST_MS, and wakes over WAKE_MS. */
export const ATTENTIVE_MS = 6000;
export const REST_MS = 1200;
export const WAKE_MS = 600;
/** The lid starts its push this long after the click (the flight lands at 1100 ms). */
export const LID_PUSH_AFTER_MS = 700;
const ATTENTION_SPRING = { zeta: 0.7, hz: 4 } as const;
const TILT_SPRING = { zeta: 0.8, hz: 6 } as const;
const LEAN_SPRING = { zeta: 0.8, hz: 3 } as const;
const PARALLAX_SPRING = { zeta: 0.9, hz: 1.5 } as const;
/**
 * A label winds to upright (attention, a pick, homing, out of the player) in about this long (ms), slower when that
 * would spin it into the blur (never past BLUR_FROM, so the print stays sharp), faster only to be upright on time.
 */
const UPRIGHT_TURN_MS = 320;
const MAX_TILT = (7 * Math.PI) / 180;
const LEAN_ANGLE = (3 * Math.PI) / 180;
const LEAN_PART = 0.006;
const SYMPATHY_DIP = 0.0015;
const SYMPATHY_MS = 160;
/** Under reduced motion ▷II is drawn pressed this long on a pick. */
const REDUCED_PRESS_MS = 120;
/** Spin-up durations: after an insert, from paused (sound first), from stopped. */
const SPIN_UP_MS = { insert: 900, paused: 350, stopped: 600 } as const;
/** Spin-down durations: pause, stop (a brake). */
const SPIN_DOWN_MS = { paused: 700, stopped: 1100 } as const;
/** How finely the way of a disc leaving the player is searched for the moment it is clear (ms). */
const PLAN_STEP_MS = 10;
/** A clearance check looks at every this many steps first (see clearOver). */
const CLEAR_COARSE_STEPS = 6;
/** A disc picked while others are still coming up tries to set off this much later each time its way meets one. */
const RISE_WAIT_STEP_MS = 30;
/** And keeps this far clear of them (m). */
const RISE_MARGIN = 0.002;
/** A disc re-laid out mid-motion waits at most this long in its old slot for its glide to be clear (ms). */
const RELAYOUT_MAX_WAIT_MS = 3000;
/** How far (m) such a glide may bow towards the camera to pass in front of a disc in its way. */
const RELAYOUT_BOWS = [0.03, 0.06] as const;
/** A disc hurrying on a leave (DISC_MOTION.commit, the shelf paced up) never moves faster than this (m/ms: the slide's own peak). */
const COMMIT_MAX_SPEED = 0.004;
/** And its label winds to upright this briskly, so that it lies still on the spindle by the press. */
const COMMIT_SPIN_SPRING = { zeta: 0.9, hz: 6 } as const;
/** A leave too long for DISC_MOTION.leave.lidStartBy is paced up in steps of this. */
const PACE_STEP = 0.05;

/**
 * Which discs of a new collection take over a disc already there: a new id at an index whose disc has left the
 * collection is that disc renamed (the room's placeholder shelf meeting the app's albums, on a slow player chunk),
 * so it re-prints where it is rather than vanishing and rising again. The loaded disc leaves with its id.
 * Returns new id -> the id it takes over.
 */
export function discHeirs(
  before: readonly string[],
  after: readonly string[],
  loaded: string | null,
): Map<string, string> {
  const known = new Set(before);
  const staying = new Set(after);
  const heirs = new Map<string, string>();
  after.forEach((id, index) => {
    const previous = before[index];
    if (previous === undefined || previous === loaded || known.has(id) || staying.has(previous) || heirs.has(id)) {
      return;
    }
    heirs.set(id, previous);
  });
  return heirs;
}

/** The discs moving in front of the shelf (where a disc going in flies): those coming up, and those called back. */
const IN_FRONT: ReadonlySet<DiscPhase> = new Set(['rising', 'homing']);
const RISING: ReadonlySet<DiscPhase> = new Set(['rising']);
/** Every disc that can be seen moving (a stowed disc is inside the radio). */
const SHOWN: ReadonlySet<DiscPhase> = new Set([
  'rising',
  'floating',
  'inserting',
  'dropping',
  'seated',
  'unseating',
  'exiting',
  'homing',
  'returning',
]);
const Z = new Vector3(0, 0, 1);
const X = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);

type Presence = 'away' | 'approaching' | 'present' | 'leaving';

export class Choreography {
  readonly #discs = new Map<string, DiscTrack>();
  #order: string[] = [];
  #lidPlans: { from: number; plan: LidPlan }[] = [];
  #moments: Moment[] = [];
  #presence: Presence = 'away';
  #revealedAt: number | null = null;
  #riseScheduled = false;
  #arrivals = 0;
  #loaded: string | null = null;
  #transport: Transport = 'stopped';
  #attended: string | null = null;
  /** The segments of the glides to new slots after a turn (#glideLate): a disc picked on one finishes it first. */
  readonly #relayGlides = new WeakSet<PhasedSegment>();
  readonly #presses = new Map<'rocker' | 'previous' | 'next', KeyPress>();
  #amplitude: { from: number; a0: number; a1: number; duration: number }[] = [];
  readonly #parallaxX = new Spring(0, PARALLAX_SPRING.zeta, PARALLAX_SPRING.hz);
  readonly #parallaxY = new Spring(0, PARALLAX_SPRING.zeta, PARALLAX_SPRING.hz);

  readonly #options: ChoreographyOptions;

  constructor(options: ChoreographyOptions) {
    this.#options = options;
  }

  /** The visitor is at the radio or on the way. */
  get atRadio(): boolean {
    return this.#presence === 'approaching' || this.#presence === 'present';
  }

  /** Every disc not in the player is out in its slot, label out, and nothing of theirs moves: the shelf is up. */
  discsOut(t: number): boolean {
    if (this.#presence !== 'present' || !this.#riseScheduled) return false;
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded) continue;
      if (track.rest !== 'floating' || track.segments.some((segment) => segment.end > t)) return false;
    }
    return true;
  }

  lidDegrees(t: number): number {
    return lidAt(this.#lidPlanAt(t), t).degrees;
  }

  /**
   * The collection in display order with its slots; new discs wait inside the radio, the others re-lay.
   * `heirs` (new id -> the id it takes over, from {@link discHeirs}) renames a disc in place instead.
   */
  setDiscs(
    ids: readonly string[],
    slots: readonly DiscSlot[],
    t: number,
    heirs: ReadonlyMap<string, string> = new Map(),
  ): void {
    const next = new Map<string, DiscTrack>();
    ids.forEach((id, index) => {
      const slot = slots[index];
      if (!slot || next.has(id)) return;
      const heir = heirs.get(id);
      const existing = this.#discs.get(id) ?? (heir === undefined ? undefined : this.#rename(heir, id));
      if (existing) {
        const moved = existing.slot.position.distanceTo(slot.position) > 1e-6;
        existing.index = index;
        this.#relaySlot(existing, slot, moved, t);
        next.set(id, existing);
      } else {
        next.set(id, this.#newTrack(id, index, slot, t));
      }
    });
    this.#discs.clear();
    for (const [id, track] of next) this.#discs.set(id, track);
    this.#order = [...next.keys()];
    if (this.#loaded !== null && !this.#discs.has(this.#loaded)) this.#loaded = null;
    // Newcomers at a radio already open rise to join the others.
    if (this.#presence === 'present' && this.#riseScheduled) this.#scheduleRise(t);
  }

  /** The disc `from` goes on as `to`, wherever it is in its film, its future moments with it. */
  #rename(from: string, to: string): DiscTrack | undefined {
    const track = this.#discs.get(from);
    if (!track || from === this.#loaded) return undefined;
    const owner = (name: string) => (name === from ? to : name === `spin:${from}` ? `spin:${to}` : name);
    this.#moments = this.#moments.map((moment) =>
      moment.disc === from || owner(moment.owner) !== moment.owner
        ? { ...moment, owner: owner(moment.owner), ...(moment.disc === from ? { disc: to } : {}) }
        : moment,
    );
    if (this.#attended === from) this.#attended = to;
    // In place: its film's segments may hold the track itself.
    track.id = to;
    return track;
  }

  /**
   * The viewport or insets changed: every disc ends up in its new slot. Resting ones cut there with the camera; those
   * in motion glide over once their move is done, each one only when its glide is clear of every other disc.
   */
  relayout(slots: readonly DiscSlot[], t: number): void {
    const late: DiscTrack[] = [];
    this.#order.forEach((id, index) => {
      const track = this.#discs.get(id);
      const slot = slots[index];
      if (!track || !slot) return;
      const moved = track.slot.position.distanceTo(slot.position) > 1e-6 || track.slot.tilt !== slot.tilt;
      if (this.#relaySlot(track, slot, moved, t)) late.push(track);
    });
    this.#glideLate(late);
  }

  /** The camera set off for the radio at `clickAt`; the device acts on it at `t` (later if it was still loading). */
  approach(clickAt: number, t: number): void {
    if (this.atRadio) return;
    const turningBack = this.#presence === 'leaving';
    this.#presence = 'approaching';
    this.#revealedAt = null;
    this.#riseScheduled = false;
    this.#arrivals++;
    if (this.#options.reducedMotion()) {
      // At the cut the lid is open and the discs are in their slots.
      const cut = Math.max(t, clickAt + this.#options.reducedFadeMs);
      this.#setLid(t, { kind: 'open' }, cut);
      this.#addMoment({ at: cut, owner: 'lid', cue: 'lid-unlatch', part: 'lid' });
      for (const track of this.#discs.values()) {
        if (track.id === this.#loaded) continue;
        this.#cancel(track.id, t);
        track.segments = [{ ...still(this.#poseAt(track, t), t, cut), phase: this.#phaseAt(track, t) }];
        track.rest = 'floating';
        track.spin = [{ kind: 'coast', t0: t, phi0: 0, omega: 0 }];
      }
      return;
    }
    const plan = openFrom(this.#lidPlanAt(t), t, clickAt + LID_PUSH_AFTER_MS);
    this.#setLid(t, plan, t);
    this.activity(t);
    if (!turningBack) return;
    // Turning back mid-leave: every disc on its way home retraces its way so far, as if the film ran backwards
    // (so no two meet, as they did not on the way), and is back in its slot as long after as it set off before.
    // The film runs once the lid is back past 80 deg: a disc on its way down the slit would otherwise come back up
    // through a lid that is only just reopening. Until then each holds where it is, clear of a lid that only opens.
    const gate = Math.max(t, lidReaches(plan, LID_DISC_GATE_DEGREES, t) ?? t);
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded || track.rest !== 'stowed' || !track.segments.some((s) => s.end > t)) continue;
      // One out of the player on the short way (no slot it set off from) goes on down the slit, and rises again
      // with the others.
      const setOff = track.setOff;
      if (setOff === null) continue;
      track.setOff = null;
      this.#cancel(track.id, t);
      const way = track.segments;
      const back = Math.max(0, t - setOff);
      // One that had not set off yet (it was still arriving, or waiting its turn) carries on with its arrival.
      const hold = gate - t;
      track.segments =
        back > 0
          ? [
              ...(hold > 0 ? [{ ...still(poseOn(way, t), t, gate), phase: 'rising' as const }] : []),
              { start: gate, end: gate + back, at: (at: number) => poseOn(way, 2 * t + hold - at), phase: 'rising' },
            ]
          : way.filter((segment) => segment.end > t && segment.end <= setOff);
      track.rest = 'floating';
      track.spin = this.#labelSpin(track, t);
    }
  }

  /** The camera landed at the radio: the discs rise as soon as the lid is past 80°, prints or not. */
  reveal(t: number): void {
    if (this.#presence !== 'approaching') return;
    this.#presence = 'present';
    this.#revealedAt = t;
    this.#riseScheduled = true;
    if (!this.#options.reducedMotion()) this.#scheduleRise(t);
  }

  /**
   * The camera is asked to leave, and the radio packs up while it is still on screen: a disc going in commits (what is
   * left of its way plays sooner), one leaving the player takes the short way down the slit, and the shelf sets off
   * home at once (a disc still arriving gets there first), paced so that the lid starts down within
   * DISC_MOTION.leave.lidStartBy of the request.
   */
  conceal(t: number): void {
    if (!this.atRadio) return;
    this.#presence = 'leaving';
    this.attend(null, t);
    if (this.#options.reducedMotion()) {
      const cut = t + this.#options.reducedFadeMs;
      const open = this.lidDegrees(t) > 0;
      this.#setLid(t, { kind: 'closed' }, cut);
      // After the lid's plan, which drops the moments it replaces: the latch still sounds at the cut.
      if (open) this.#addMoment({ at: cut, owner: 'lid', cue: 'lid-latch', part: 'lid' });
      for (const track of this.#discs.values()) {
        if (track.id === this.#loaded) continue;
        this.#cancel(track.id, t);
        track.segments = [{ ...still(this.#poseAt(track, t), t, cut), phase: this.#phaseAt(track, t) }];
        track.rest = 'stowed';
      }
      return;
    }
    const { leave } = DISC_MOTION;
    // Out of the player first, each in turn (the furthest on first), and down the slit before any disc of the shelf;
    // one already behind the shelf on its way home gets there sooner.
    let lastSink = Number.NEGATIVE_INFINITY;
    let closeAt = t;
    const slit = new Set<DiscTrack>();
    const leaving = [...this.#discs.values()]
      .filter((track) => track.id !== this.#loaded && this.#outOfPlayer(track, t))
      .sort((a, b) => unseatStart(a) - unseatStart(b));
    for (const track of leaving) {
      lastSink = this.#downTheSlit(track, t, lastSink + leave.sinkMs);
      closeAt = Math.max(closeAt, lastSink + leave.lidAfterSinkMs);
      slit.add(track);
    }
    const behind = [...this.#discs.values()]
      .filter((track) => track.id !== this.#loaded && !slit.has(track) && this.#phaseAt(track, t) === 'exiting')
      .sort((a, b) => unseatStart(a) - unseatStart(b));
    for (const track of behind) {
      if (!this.#acrossTheBack(track, t)) {
        this.#hurryHome(track, t);
        continue;
      }
      lastSink = this.#acrossToSlit(track, t, lastSink + leave.sinkMs, slit.size);
      closeAt = Math.max(closeAt, lastSink + leave.lidAfterSinkMs);
      slit.add(track);
    }
    // The insert the visitor asked for commits, once the well is clear of the disc going down the slit.
    const loaded = this.#loaded === null ? undefined : this.#discs.get(this.#loaded);
    if (loaded) {
      this.#commit(loaded, t);
      if (loaded.insert) closeAt = Math.max(closeAt, loaded.insert.contact);
    }
    // Discs still on their way to their slots get there first: they go home from where they rest.
    const going: DiscTrack[] = [];
    const ready = new Map<DiscTrack, number>();
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded || slit.has(track)) continue;
      if (this.#phaseAt(track, t) === 'stowed' && !track.segments.some((segment) => segment.end > t)) {
        // Still inside the radio (a rise that had not started): it stays there.
        this.#cancel(track.id, t);
        track.segments = [];
        track.rest = 'stowed';
        continue;
      }
      going.push(track);
      // In its slot, that is: it may set off home while it still settles there.
      let inSlot = t;
      if (track.rest === 'floating') {
        for (const segment of track.segments) {
          if (segment.end > t && segment.phase !== 'floating') inSlot = Math.max(inSlot, segment.end);
        }
      }
      ready.set(track, inSlot);
    }
    // The nearest home first, so no disc passes a slot still taken (and so none passes a disc turning over in its
    // slot: the ones before it are already on their way to the slot); each waits for the last to be down the slot.
    const order = riseOrder(going.map((track) => track.slot))
      .reverse()
      .map((index) => going[index] as DiscTrack);
    const arrivals = order.map((track) => track.segments.filter((segment) => segment.end > t));
    const inSlots = order.map((track) => ready.get(track) ?? t);
    for (const track of order) {
      this.#cancel(track.id, t);
      track.insert = null;
      track.spin = this.#decaySpin(track, t, 0);
    }
    // The ways already planned (out of the player and down the slit, the insert committing): the shelf's way home
    // waits until it meets none of them.
    const planned = [...slit, ...(loaded ? [loaded] : [])].map((track) =>
      track.segments.filter((segment) => segment.end > t),
    );
    const deadline = t + leave.lidStartBy;
    let pace = 1;
    let sinks = this.#packUp(order, arrivals, inSlots, t, pace, lastSink, planned);
    while (Math.max(closeAt, sinks.at(-1) ?? t) > deadline && pace > leave.minPace) {
      pace = Math.max(leave.minPace, pace - PACE_STEP);
      sinks = this.#packUp(order, arrivals, inSlots, t, pace, lastSink, planned);
    }
    sinks.forEach((at, k) => {
      const track = order[k] as DiscTrack;
      track.rest = 'stowed';
      this.#addMoment({ at, owner: track.id, cue: 'disc-sink', order: k + slit.size, disc: track.id });
      // The lid starts down as the last disc starts down the slot: it falls slowly at first, and is still behind
      // the slot's plane when the disc is in (the sweep checks it).
      closeAt = Math.max(closeAt, at + leave.lidAfterSinkMs);
    });
    this.#setLid(t, closeFrom(this.#lidPlanAt(closeAt), closeAt), closeAt);
  }

  /**
   * The shelf's way home at `pace` (1 as drawn; their moves shorter below it, never faster than COMMIT_MAX_SPEED, the
   * slot's own timing kept): each disc in `order` floats on in its slot after its `arrival` until its turn, out into
   * its lane, across over the slot and down it, no sooner than `after` the last disc went down (planned at `t`). Its
   * turn comes once it is `inSlot`, a stagger after the one before (so none passes a disc still on its way to its slot
   * nearer the slot), and once its way home meets none of the discs still on theirs (a disc hurrying home from the
   * player) nor any of the `planned` ways (a disc going down the slit, the insert committing). Returns when each
   * starts down the slot.
   */
  #packUp(
    order: readonly DiscTrack[],
    arrivals: readonly (readonly PhasedSegment[])[],
    inSlot: readonly number[],
    t: number,
    pace: number,
    after: number,
    planned: readonly (readonly PhasedSegment[])[],
  ): number[] {
    const { leave } = DISC_MOTION;
    let lastSink = after;
    let start = Number.NEGATIVE_INFINITY;
    return order.map((track, k) => {
      const arrival = arrivals[k] ?? [];
      const ahead = [
        ...arrivals.slice(k + 1).map((way) => way.filter((segment) => segment.phase !== 'floating')),
        ...planned,
      ];
      const allIn = Math.max(t, ...ahead.flatMap((way) => way.map((segment) => segment.end)));
      start = Math.max(inSlot[k] ?? t, start + leave.stagger * pace);
      // It floats on in its slot until its turn (or settles there until then), and goes from exactly where it is.
      track.segments = [...arrival];
      let home = this.#wayHome(track, arrival, t, start, pace, leaveLane(k), lastSink);
      while (start < allIn && !clearOfWays(home.way, ahead, start)) {
        start += RISE_WAIT_STEP_MS;
        home = this.#wayHome(track, arrival, t, start, pace, leaveLane(k), lastSink);
      }
      track.segments = home.segments;
      track.setOff = start;
      lastSink = home.sinkAt;
      return home.sinkAt;
    });
  }

  /**
   * One disc's way home from `start` at `pace` in `lane` (its `arrival` kept until then, no sooner down the slot than
   * a gap after `after`): all its segments, the part from `start`, and when it starts down the slot.
   */
  #wayHome(
    track: DiscTrack,
    arrival: readonly PhasedSegment[],
    t: number,
    start: number,
    pace: number,
    lane: number,
    after: number,
  ): { segments: PhasedSegment[]; way: PhasedSegment[]; sinkAt: number } {
    const { leave } = DISC_MOTION;
    const from = this.#drawnPose(track, start);
    const kept = arrival
      .filter((segment) => segment.start < start)
      .map((segment) => (segment.end > start ? { ...segment, end: start } : segment));
    const waitFrom = kept.at(-1)?.end ?? t;
    const out = outOf(
      from,
      track.slot,
      lane,
      start,
      pacedMs(leave.outMs, pace, (ms) => outOf(from, track.slot, lane, start, ms)),
    );
    const hover = hoverPose(track.slot, lane);
    const outEnd = out.at(out.end);
    const side = across(
      outEnd,
      hover.position,
      out.end,
      pacedMs(leave.acrossMs, pace, (ms) => across(outEnd, hover.position, out.end, ms)),
    );
    const sinkAt = Math.max(side.end, after + leave.sinkGap);
    const waitPose = side.at(side.end);
    const way: PhasedSegment[] = [
      { ...out, phase: 'returning' },
      { ...side, phase: 'returning' },
      { ...still(waitPose, side.end, sinkAt), phase: 'returning' },
      { ...sink(waitPose, sinkAt), phase: 'returning' },
    ];
    return {
      segments: [...kept, { ...still(slotPose(track.slot), waitFrom, start), phase: 'floating' }, ...way],
      way,
      sinkAt,
    };
  }

  /** A new loaded disc. `animate` false (the stage cannot be seen, the device woke up late) seats it at once. */
  setLoaded(disc: string | null, t: number, animate: boolean): void {
    if (disc === this.#loaded) return;
    const previous = this.#loaded === null ? undefined : this.#discs.get(this.#loaded);
    this.#loaded = disc;
    const incoming = disc === null ? undefined : this.#discs.get(disc);
    const reduced = this.#options.reducedMotion();
    const instant = !animate || reduced || !this.atRadio;
    if (previous) this.#leaveSeat(previous, t, instant);
    if (!incoming) return;
    // A disc still on its way up (a keyboard can choose it the moment the camera lands) comes up out of the slot and
    // over to its column, then flies on from there, already moving, instead of turning into its slot first.
    const phase = this.#phaseAt(incoming, t);
    const fromRise = !instant && (phase === 'stowed' || phase === 'rising');
    // On its way home from the player and picked again where it cannot go back (#backIntoPlayer), or on its way to the
    // slot a turned screen gave it (#glideLate): it goes on there, its way was planned clear of the rest, and sets
    // off from its slot like any disc on the shelf.
    const gliding = incoming.segments.some((segment) => segment.end > t && this.#relayGlides.has(segment));
    const homeFirst = !instant && (phase === 'unseating' || phase === 'exiting' || (phase === 'floating' && gliding));
    const arriving = fromRise
      ? this.#wayUp(incoming, t)
      : homeFirst
        ? incoming.segments.filter((segment) => segment.end > t)
        : [];
    const arrived = Math.max(t, arriving.at(-1)?.end ?? t);
    const live = this.#drawnPose(incoming, arrived);
    // Its way up still sounds; what it had planned after that (over to the slot, turning over) is replaced.
    this.#cancel(incoming.id, arrived);
    if (incoming.id === this.#attended) this.attend(null, t);
    if (instant) {
      incoming.segments = [];
      incoming.rest = 'seated';
      incoming.insert = null;
      const omega = this.#transport === 'playing' && !reduced ? DISC_MOTION.playSpeed : 0;
      incoming.spin = [{ kind: 'coast', t0: t, phi0: 0, omega }];
      if (animate && reduced) {
        this.#addMoment({ at: t, owner: incoming.id, cue: 'disc-seat', disc: incoming.id });
        this.press('play-pause', t, t + REDUCED_PRESS_MS, { instant: true });
      }
      return;
    }
    const { pick } = DISC_MOTION;
    if (this.#backIntoPlayer(incoming, t)) return;
    const eye = this.#options.eye();
    // A disc called back in front goes home before this one leaves the shelf (their ways would cross), and it leaves
    // so as to be in front of the radio a beat before the well is clear of the disc going out: until then it floats
    // on in its slot, and anticipates as it sets off. While other discs are still coming up it also waits (in its
    // slot, or in its column) until its way to the seat is clear of theirs.
    const wellClear = this.#wellClear(incoming, t);
    const anticipationMs = fromRise ? 0 : pick.anticipationMs;
    const earliest = Math.max(
      arrived + anticipationMs,
      this.#homingDone(incoming, t),
      wellClear - DISC_MOTION.swap.aimMs - pick.flightMs,
    );
    const plan = (setOff: number) =>
      this.#insertPlan(incoming, { arriving, arrived, live, fromRise, wellClear, eye, anticipationMs }, setOff);
    const riseDone = this.#riseDone(incoming, t);
    let way = plan(earliest);
    // Only what is new is checked: the way up it is on (or home, before setting off) was planned clear of the rest,
    // and in the stack inside the radio the discs lie on one another by design.
    for (let setOff = earliest; setOff < riseDone && !this.#clearOf(incoming, way.segments, arrived, RISING); ) {
      setOff = Math.min(riseDone, setOff + RISE_WAIT_STEP_MS);
      way = plan(setOff);
    }
    const { flown, slideStart, dropStart, contact } = way;
    incoming.segments = way.segments;
    incoming.rest = 'seated';
    // The label winds to upright in flight and lies still on the spindle until ▷II goes down.
    // It starts at once (on a tap the attention and the pick are one moment), so it can turn slowly enough to keep
    // its print, and may turn back to the upright behind it when that is the gentler way.
    incoming.spin = [
      this.#uprightTurn(incoming.spin, t, UPRIGHT_TURN_MS, { withinMs: contact - t, mayTurnBack: true }),
    ];
    this.#addMoment({ at: t, owner: incoming.id, cue: 'disc-pick', disc: incoming.id });
    this.#seatAt(incoming, { flown, slideStart, dropStart, contact }, t, true);
  }

  /**
   * The disc lands on the spindle at `contact` (it sounds, if still to come, and the shelf dips in sympathy), and the
   * radio presses its own ▷II once it is down: slowly in, to the bottom (the sound starts), held, up.
   */
  #seatAt(track: DiscTrack, way: Omit<Insert, 'bottom'>, t: number, sympathy: boolean): void {
    const { pick } = DISC_MOTION;
    const { contact } = way;
    const pressDown = contact + pick.pressAfter;
    const bottom = pressDown + pick.pressDownMs;
    track.insert = { ...way, bottom };
    if (contact > t) this.#addMoment({ at: contact, owner: track.id, cue: 'disc-seat', disc: track.id });
    if (sympathy) {
      for (const other of this.#discs.values()) {
        if (other === track) continue;
        other.bumps.push({
          start: contact,
          duration: SYMPATHY_MS,
          offset: new Vector3(0, -SYMPATHY_DIP, 0),
          attack: SYMPATHY_MS / 2,
          release: SYMPATHY_MS / 2,
        });
      }
    }
    this.press('play-pause', pressDown, bottom + pick.pressHoldMs, { owner: track.id, inMs: pick.pressDownMs });
    this.#addMoment({ at: bottom, owner: track.id, seated: true, disc: track.id });
    if (this.#transport === 'playing') this.#spinUp(track, bottom, SPIN_UP_MS.insert);
  }

  /** A disc's way into the player if it sets off at `setOff` (from its slot, or on from its column). */
  #insertPlan(
    incoming: DiscTrack,
    way: {
      readonly arriving: readonly PhasedSegment[];
      readonly arrived: number;
      readonly live: DiscPose;
      readonly fromRise: boolean;
      readonly wellClear: number;
      readonly eye: Vector3;
      readonly anticipationMs: number;
    },
    setOff: number,
  ): {
    segments: PhasedSegment[];
    flown: number;
    slideStart: number;
    dropStart: number;
    contact: number;
  } {
    const { pick } = DISC_MOTION;
    const { arriving, arrived, live, fromRise, wellClear, eye } = way;
    const wait = Math.max(0, setOff - arrived - way.anticipationMs);
    // A disc picked on its way up waits in its column, where it is (it never got to its slot); one on the shelf
    // floats on in its slot and sets off from where it floats then.
    const from = !fromRise && wait > 0 ? this.#drawnPose(incoming, arrived + wait) : live;
    const waitPose = fromRise ? live : slotPose(incoming.slot);
    // Coming out of the radio is the wind-up: a disc picked on its way flies on from its column.
    const antic = fromRise ? still(from, arrived + wait, arrived + wait) : anticipate(from, eye, arrived + wait);
    const departure = antic.end;
    // It slides over the seat once every disc leaving the player (behind the shelf) is clear of its way: when that
    // is before it gets there, it glides through the front point without a stop.
    const glide = wellClear <= departure + pick.flightMs;
    const fly = insertFlight(antic.at(antic.end), eye, departure, pick.flightMs, glide);
    const slideStart = Math.max(fly.end, wellClear);
    const over = slide(0, slideStart, glide);
    const dropStart = over.end;
    const fall = drop(approachPoint(), dropStart);
    const segments: PhasedSegment[] = [
      ...arriving,
      ...(wait > 0
        ? [
            {
              ...still(waitPose, arrived, arrived + wait),
              phase: fromRise ? ('rising' as const) : ('floating' as const),
            },
          ]
        : []),
      { ...antic, phase: 'inserting' },
      { ...fly, phase: 'inserting' },
      ...(slideStart > fly.end
        ? [{ ...still(fly.at(fly.end), fly.end, slideStart), phase: 'inserting' as const }]
        : []),
      { ...over, phase: 'inserting' },
      { ...fall, phase: 'dropping' },
    ];
    return { segments, flown: fly.end, slideStart, dropStart, contact: dropStart + pick.dropMs };
  }

  /** When every other disc still coming up is in its slot (`t` if none is). */
  #riseDone(incoming: DiscTrack, t: number): number {
    let done = t;
    for (const track of this.#discs.values()) {
      if (track === incoming) continue;
      for (const segment of track.segments) {
        if ((segment.phase === 'rising' || segment.phase === 'stowed') && segment.end > t && segment.end < Infinity) {
          done = Math.max(done, segment.end);
        }
      }
    }
    return done;
  }

  /** True when a disc following `segments` from `t` meets none of the other discs moving in one of `phases`. */
  #clearOf(
    incoming: DiscTrack,
    segments: readonly PhasedSegment[],
    t: number,
    phases: ReadonlySet<DiscPhase>,
  ): boolean {
    const others = [...this.#discs.values()].filter((track) => track !== incoming);
    return clearAlong(segments, t, (at) =>
      others.map((track) => {
        const segment = activeSegment(track.segments, at);
        if (!phases.has(segment?.phase ?? track.rest)) return null;
        return segment ? segment.at(at) : this.#poseAt(track, at);
      }),
    );
  }

  /**
   * Picked again while still in the player or on its way out of it (a keyboard can do that): it stays, or goes back
   * onto the spindle the way it came (its way out, backwards), and ▷II presses itself. False if it is not there, or
   * if its way back is no longer clear: the disc picked after it has come into the well since, and is now on its way
   * out of it along that same way.
   */
  #backIntoPlayer(track: DiscTrack, t: number): boolean {
    const phase = this.#phaseAt(track, t);
    if (phase !== 'seated' && phase !== 'dropping' && phase !== 'unseating' && phase !== 'exiting') return false;
    const way = track.segments;
    const out = way.find((segment) => segment.phase === 'unseating');
    let contact: number;
    if (out && out.start < t) {
      // Already standing up or going: back down its own way, as long as it has been going.
      const back = t - out.start;
      const reversed: PhasedSegment[] = [
        { start: t, end: t + back, at: (at: number) => poseOn(way, 2 * t - at), phase: 'dropping' },
      ];
      if (!this.#clearOf(track, reversed, t, SHOWN)) return false;
      track.segments = reversed;
      contact = t + back;
    } else {
      // Still landing or on the spindle: it stays (its landing, if any, carries on).
      track.segments = way.filter((segment) => segment.end > t && segment.phase === 'dropping');
      contact = Math.max(t, track.segments.at(-1)?.end ?? t);
    }
    this.#cancel(track.id, t);
    track.rest = 'seated';
    const live = spinAt(track.spin, t);
    track.spin = [
      { kind: 'ramp', t0: t, phi0: live.phi, omega0: live.omega, omega1: 0, duration: 200, ease: 'out-cubic' },
    ];
    this.#seatAt(track, { flown: t, slideStart: null, dropStart: t, contact }, t, false);
    return true;
  }

  /** The seated disc's transport: spin up (sound first), spin down, brake. */
  setTransport(transport: Transport, t: number): void {
    if (transport === this.#transport) return;
    const was = this.#transport;
    this.#transport = transport;
    const track = this.#loaded === null ? undefined : this.#discs.get(this.#loaded);
    if (!track) return;
    if (this.#options.reducedMotion()) {
      track.spin = [{ kind: 'coast', t0: t, phi0: spinAt(track.spin, t).phi, omega: 0 }];
      return;
    }
    if (track.insert && t < track.insert.bottom) {
      // Still on its way in: the spin waits for the press at the bottom.
      const bottom = track.insert.bottom;
      this.#moments = this.#moments.filter((moment) => moment.owner !== `spin:${track.id}`);
      track.spin = track.spin.filter((segment) => segment.t0 < bottom);
      if (transport === 'playing') this.#spinUp(track, bottom, SPIN_UP_MS.insert);
      return;
    }
    if (transport === 'playing') this.#spinUp(track, t, was === 'paused' ? SPIN_UP_MS.paused : SPIN_UP_MS.stopped);
    else this.#spinDown(track, t, transport === 'paused' ? SPIN_DOWN_MS.paused : SPIN_DOWN_MS.stopped);
  }

  /** The disc with attention (pointer, else keyboard), or null. Only a floating disc takes it. */
  attend(disc: string | null, t: number): void {
    const target = disc !== null && this.#isFloating(disc, t) ? disc : null;
    if (target === this.#attended) return;
    const previous = this.#attended;
    this.#attended = target;
    const reduced = this.#options.reducedMotion();
    for (const track of this.#discs.values()) {
      const on = track.id === target ? 1 : 0;
      if (reduced) track.attention.set(t, on);
      else track.attention.retarget(t, on);
      if (track.id === previous) {
        track.tiltX.retarget(t, 0);
        track.tiltY.retarget(t, 0);
        if (!reduced && this.#isFloating(track.id, t)) track.spin = this.#idleSpin(track, t);
      }
      if (track.id === target && !reduced) track.spin = this.#labelSpin(track, t);
    }
    this.#leanNeighbours(t, reduced);
    this.activity(t);
  }

  /** The pointer's offset from the attended disc's centre (−1…1 each way): it tilts towards it, up to ±7°. */
  tilt(x: number, y: number, t: number): void {
    if (this.#attended === null || this.#options.reducedMotion()) return;
    const track = this.#discs.get(this.#attended);
    if (!track) return;
    track.tiltX.retarget(t, clamp(y) * MAX_TILT);
    track.tiltY.retarget(t, clamp(x) * MAX_TILT);
  }

  /** The mouse over the stage (NDC) or null: the disc layer drifts the other way. */
  parallax(ndc: { readonly x: number; readonly y: number } | null, t: number): void {
    if (this.#calm()) return;
    this.#parallaxX.retarget(t, ndc ? -ndc.x * IDLE.parallax : 0);
    this.#parallaxY.retarget(t, ndc ? -ndc.y * IDLE.parallax : 0);
  }

  /** Any input: the float wakes (over 600 ms) and comes to rest 6 s after the last one (over 1.2 s). */
  activity(t: number): void {
    if (this.#calm()) {
      this.#amplitude = [];
      return;
    }
    const now = this.#amplitudeAt(t);
    this.#amplitude = this.#amplitude.filter((entry) => entry.from <= t);
    if (now < 1) this.#amplitude.push({ from: t, a0: now, a1: 1, duration: WAKE_MS * (1 - now) });
    this.#amplitude.push({ from: t + ATTENTIVE_MS, a0: 1, a1: 0, duration: REST_MS });
    for (const track of this.#discs.values()) {
      if (track.id === this.#attended || !this.#isFloating(track.id, t)) continue;
      // A resting (upright) disc picks its idle spin back up; every floating one settles again when the float rests.
      if (now < 1 || isUprightWindDown(spinSegmentAt(track.spin, t))) track.spin = this.#idleSpin(track, t);
      track.spin = this.#restSpin(track.spin, t, t + ATTENTIVE_MS);
    }
  }

  /**
   * A key goes down at `t` and, once known, comes up at `up`. The rocker's two halves are one part: a new press of
   * either replaces the last. `inMs` slows its way down (the radio's own press after an insert).
   */
  press(
    key: RadioKey,
    t: number,
    up: number | null,
    options: {
      readonly instant?: boolean;
      readonly minHold?: number;
      readonly owner?: string;
      readonly inMs?: number;
    } = {},
  ): void {
    const press: KeyPress = {
      key,
      down: t,
      up,
      instant: options.instant,
      minHold: options.minHold,
      inMs: options.inMs,
    };
    this.#presses.set(groupOf(key), press);
    const owner = options.owner ?? 'keys';
    this.#addMoment({ at: t, owner, cue: 'key-down', part: 'keys' });
    const release = releaseStart(press);
    if (release !== null) this.#addMoment({ at: release, owner, cue: 'key-up', part: 'keys' });
    if (!options.instant) this.activity(t);
  }

  /** The pointer let go of a held key. */
  release(key: RadioKey, t: number): void {
    const press = this.#presses.get(groupOf(key));
    if (!press || press.key !== key || press.up !== null) return;
    const released = { ...press, up: t };
    this.#presses.set(groupOf(key), released);
    this.#addMoment({ at: releaseStart(released) ?? t, owner: 'keys', cue: 'key-up', part: 'keys' });
  }

  /** Fires every moment in (last advance, t] in time order. */
  advance(t: number): Moment[] {
    // Every moment is fired once and dropped: one decided at the very time of the last frame still fires.
    const due = this.#moments.filter((moment) => moment.at <= t);
    this.#moments = this.#moments.filter((moment) => moment.at > t);
    for (const track of this.#discs.values()) {
      if (track.insert && t >= track.insert.bottom) track.insert = null;
      track.bumps = track.bumps.filter((bump) => t < bump.start + bump.duration);
    }
    return due.sort((a, b) => a.at - b.at);
  }

  /** When the next moment is due, if any: a device that draws no frames must still wake for it. */
  nextMoment(): number | null {
    let next: number | null = null;
    for (const moment of this.#moments) if (next === null || moment.at < next) next = moment.at;
    return next;
  }

  sample(t: number): ChoreographySample {
    const lid = lidAt(this.#lidPlanAt(t), t);
    const amplitude = this.#amplitudeAt(t);
    const discs: DiscSample[] = [];
    let moving = lid.moving || this.#lidPlans.some((entry) => entry.from > t);
    let ambient = this.#amplitude.some((entry) => t >= entry.from && t < entry.from + entry.duration);
    for (const id of this.#order) {
      const track = this.#discs.get(id);
      if (!track) continue;
      const { pose, phase, floating } = this.#drawn(track, t, amplitude);
      const spin = spinAt(track.spin, t);
      if (track.segments.some((segment) => segment.end > t)) moving = true;
      if (track.insert) moving = true;
      if (floating) {
        if ([track.attention, track.lean, track.tiltX, track.tiltY].some((spring) => !spring.settled(t, 1e-3))) {
          moving = true;
        }
        if (amplitude > 0) ambient = true;
      }
      if (track.bumps.some((bump) => t > bump.start && t < bump.start + bump.duration)) moving = true;
      // A floating disc's idle spin (and its settling when the float rests) is ambient; the attended disc winding
      // to upright, a spin-up or a brake need every frame, and so does every spin change when there is no float
      // (reduced motion, the slow tier): no ambient frame would ever bring its label to rest upright.
      if (spinChanging(track.spin, t) && (phase !== 'floating' || id === this.#attended || this.#calm())) {
        moving = true;
      }
      const orientation = pose.orientation.multiply(new Quaternion().setFromAxisAngle(Z, spin.phi));
      discs.push({
        id,
        phase,
        position: pose.position,
        orientation,
        scale: pose.scale,
        omega: spin.omega,
        visible: phase !== 'stowed',
      });
    }
    const keys = this.#keysAt(t);
    for (const press of this.#presses.values()) if (keyMoving(press, t)) moving = true;
    return { lid: lid.degrees, discs, keys, moving, ambient };
  }

  /** The float drifts at `t` (a floating disc and an attentive visitor): ambient frames are wanted. */
  ambientAt(t: number): boolean {
    if (
      this.#amplitudeAt(t) <= 0 &&
      !this.#amplitude.some((entry) => t >= entry.from && t < entry.from + entry.duration)
    ) {
      return false;
    }
    for (const track of this.#discs.values()) if (this.#phaseAt(track, t) === 'floating') return true;
    return false;
  }

  /** The phase of disc `id` at `t` (for picking: only floating discs are picked, the seated one is pressed). */
  phaseOf(id: string, t: number): DiscPhase | null {
    const track = this.#discs.get(id);
    return track ? this.#phaseAt(track, t) : null;
  }

  /** Reduced motion or the slow tier: the discs never float. */
  #calm(): boolean {
    return this.#options.reducedMotion() || this.#options.slow();
  }

  #keysAt(t: number): KeySample {
    const rocker = this.#presses.get('rocker');
    const travel = (press: KeyPress | undefined) => (press ? keyTravel(press, t) : 0);
    return {
      rockerKey: rocker && (rocker.key === 'play-pause' || rocker.key === 'stop') ? rocker.key : null,
      rockerTravel: travel(rocker),
      previous: travel(this.#presses.get('previous')),
      next: travel(this.#presses.get('next')),
    };
  }

  #newTrack(id: string, index: number, slot: DiscSlot, t: number): DiscTrack {
    return {
      id,
      index,
      slot,
      character: idleCharacter(index),
      segments: [],
      rest: this.atRadio && this.#options.reducedMotion() ? 'floating' : 'stowed',
      spin: [{ kind: 'coast', t0: t, phi0: 0, omega: 0 }],
      insert: null,
      climb: null,
      setOff: null,
      attention: new Spring(0, ATTENTION_SPRING.zeta, ATTENTION_SPRING.hz),
      lean: new Spring(0, LEAN_SPRING.zeta, LEAN_SPRING.hz),
      tiltX: new Spring(0, TILT_SPRING.zeta, TILT_SPRING.hz),
      tiltY: new Spring(0, TILT_SPRING.zeta, TILT_SPRING.hz),
      bumps: [],
    };
  }

  /**
   * Discs inside the radio rise once the camera has landed and the lid is past 80°: the furthest slot first, each
   * into its own lane, the next one coming up behind it; across to its slot, and in, turning over there.
   */
  #scheduleRise(t: number): void {
    this.#riseScheduled = true;
    const gate = lidReaches(this.#lidPlanAt(t), LID_DISC_GATE_DEGREES, t) ?? t;
    const start = Math.max(t, this.#revealedAt ?? t, gate);
    const warm = this.#arrivals > 1 || this.#options.slow();
    const motion = DISC_MOTION;
    const riseMs = warm ? motion.rise.warmMs : motion.rise.ms;
    const acrossMs = warm ? motion.across.warmMs : motion.across.ms;
    const intoMs = warm ? motion.into.warmMs : motion.into.ms;
    const waiting = [...this.#discs.values()].filter(
      (track) =>
        track.id !== this.#loaded &&
        this.#phaseAt(track, t) === 'stowed' &&
        !track.segments.some((segment) => segment.end > t),
    );
    if (waiting.length === 0) return;
    const order = riseOrder(waiting.map((track) => track.slot)).map((index) => waiting[index] as DiscTrack);
    const stagger = riseStagger(order.length, warm);
    const restAt = this.#restStartAfter(t);
    order.forEach((track, k) => {
      const begin = start + stagger * k;
      const hidden = hiddenPose();
      const up = rise(hidden, apexPose(track.slot, riseLane(k, order.length)), begin, riseMs);
      const side = across(up.at(up.end), track.slot.position, up.end, acrossMs);
      const enter = into(side.at(side.end), track.slot, side.end, intoMs);
      const rest = settle(enter.at(enter.end), track.slot, enter.end);
      this.#cancel(track.id, t);
      const way: PhasedSegment[] = [
        { ...still(hidden, t, begin), phase: 'stowed' },
        { ...up, phase: 'rising' },
        { ...side, phase: 'rising' },
      ];
      track.segments = [...way, { ...enter, phase: 'rising' }, { ...rest, phase: 'floating' }];
      track.climb = { way, intoMs, order: k };
      track.rest = 'floating';
      // Spinning on the way up; across, the spin decays to the idle rate.
      const idle = this.#calm() ? 0 : track.character.spin;
      const rising: SpinSegment = { kind: 'coast', t0: begin, phi0: 0, omega: motion.riseSpin };
      const atApex = spinAt([rising], up.end);
      const spin: SpinTrack = [
        { kind: 'coast', t0: t, phi0: 0, omega: 0 },
        rising,
        { kind: 'decay', t0: up.end, phi0: atApex.phi, omega0: atApex.omega, omega1: idle, tau: motion.glideSpinTau },
      ];
      track.spin = this.#restSpin(spin, t, Math.max(rest.end, restAt));
      this.#addMoment({ at: begin, owner: track.id, cue: 'disc-rise', order: k, disc: track.id });
      this.#addMoment({ at: enter.start + intoMs / 2, owner: track.id, cue: 'disc-flip', order: k, disc: track.id });
    });
  }

  /** A disc called away from the seat (another was picked, or the player emptied). */
  #leaveSeat(track: DiscTrack, t: number, instant: boolean): void {
    const phase = this.#phaseAt(track, t);
    const live = this.#poseAt(track, t);
    this.#cancel(track.id, t);
    if (instant) {
      track.segments = [];
      track.rest = this.atRadio ? 'floating' : 'stowed';
      track.insert = null;
      track.spin = [{ kind: 'coast', t0: t, phi0: 0, omega: 0 }];
      return;
    }
    const { swap, pick } = DISC_MOTION;
    if (phase === 'stowed' || phase === 'rising') {
      // Picked on its way up and let go before it left for the player: it goes on into its slot, from its column
      // (out of the radio first if it was still on its way there), or from wherever it waited.
      const way = this.#wayUp(track, t);
      const column = way.at(-1);
      const intoMs = track.climb?.intoMs ?? DISC_MOTION.into.warmMs;
      const enter = column
        ? into(column.at(column.end), track.slot, column.end, intoMs)
        : into(live, track.slot, t, intoMs);
      const rest = settle(enter.at(enter.end), track.slot, enter.end);
      track.segments = [...way, { ...enter, phase: 'rising' }, { ...rest, phase: 'floating' }];
      track.rest = 'floating';
      track.insert = null;
      const idle = this.#calm() ? 0 : track.character.spin;
      track.spin = this.#restSpin(this.#decaySpin(track, t, idle), t, Math.max(rest.end, this.#restStartAfter(t)));
      const order = track.climb?.order ?? 0;
      this.#addMoment({ at: enter.start + intoMs / 2, owner: track.id, cue: 'disc-flip', order, disc: track.id });
      return;
    }
    if (phase === 'floating' || phase === 'homing') {
      // It had not left the shelf yet (it was waiting its turn), or is on its way back already: it stays or goes on.
      track.segments = phase === 'homing' ? track.segments.filter((segment) => segment.end > t) : [];
      track.rest = 'floating';
      track.insert = null;
      return;
    }
    if (phase === 'inserting') {
      // Not committed to the drop yet: home the way it came, in front of the shelf (out from under it first).
      const out = underShelf(live) ? backOut(live, t) : null;
      const wayHome = (straight: boolean): PhasedSegment[] => {
        const back = homeInFront(
          out ? out.at(out.end) : live,
          track.slot,
          this.#options.eye(),
          out?.end ?? t,
          straight,
        );
        const rest = settle(back.at(back.end), track.slot, back.end);
        return [
          ...(out ? [{ ...out, phase: 'homing' as const }] : []),
          { ...back, phase: 'homing' },
          { ...rest, phase: 'floating' },
        ];
      };
      // From the camera's side, unless that crosses a disc in front of its slot (a deep arc of many discs).
      const towardsCamera = wayHome(false);
      track.segments = this.#clearOf(track, towardsCamera, t, SHOWN) ? towardsCamera : wayHome(true);
      track.rest = 'floating';
      track.insert = null;
      track.spin = this.#labelSpin(track, t);
      return;
    }
    // On the spindle, or committed to the drop: it lands, brakes, stands up and goes home behind the shelf.
    const insert = track.insert;
    const dropping = phase === 'dropping' && insert !== null;
    const landed = dropping ? insert.contact + pick.bounceMs : t;
    const spin = spinAt(track.spin, t);
    if (Math.abs(spin.omega) > 0.5) {
      this.#addMoment({ at: t, owner: track.id, cue: 'spin-down', disc: track.id });
      track.spin = [
        {
          kind: 'ramp',
          t0: t,
          phi0: spin.phi,
          omega0: spin.omega,
          omega1: 0,
          duration: swap.brakeMs,
          ease: 'out-cubic',
        },
      ];
    }
    const kept = dropping ? track.segments.filter((segment) => segment.end > t) : [];
    // It holds on the spindle from where what it keeps ends: a drop hurried to its contact ends before its bounce
    // would, and a gap there would show the disc at rest in its slot for a frame.
    const heldFrom = Math.max(t, kept.at(-1)?.end ?? t);
    // A disc already dropping lands before it leaves: its contact still sounds.
    if (dropping && insert.contact > t) {
      this.#addMoment({ at: insert.contact, owner: track.id, cue: 'disc-seat', disc: track.id });
    }
    const exitZ = exitPlane([...this.#discs.values()].map((disc) => disc.slot));
    const wayHome = (at: number): PhasedSegment[] => {
      const stand = standUp(at);
      const back = backToExit(stand.at(stand.end), exitZ, stand.end);
      const side = across(back.at(back.end), track.slot.position, back.end, swap.acrossMs);
      const home = into(side.at(side.end), track.slot, side.end, swap.intoMs, false);
      const rest = settle(home.at(home.end), track.slot, home.end);
      return [
        ...kept,
        { ...still(seatPose(), heldFrom, at), phase: 'seated' },
        { ...stand, phase: 'unseating' },
        { ...back, phase: 'exiting' },
        { ...side, phase: 'exiting' },
        { ...home, phase: 'exiting' },
        { ...rest, phase: 'floating' },
      ];
    };
    // The discs still coming up (a warm arrival with this one in the player) cross the back on their way to their
    // slots: it stays on the spindle until its way home behind the shelf is clear of theirs.
    const riseDone = this.#riseDone(track, t);
    let standAt = Math.max(landed, heldFrom, t + swap.brakeMs);
    let way = wayHome(standAt);
    while (standAt < riseDone && !this.#clearOf(track, way, t, RISING)) {
      standAt = Math.min(riseDone, standAt + RISE_WAIT_STEP_MS);
      way = wayHome(standAt);
    }
    track.segments = way;
    track.rest = 'floating';
    track.insert = null;
    this.#addMoment({ at: standAt, owner: track.id, cue: 'disc-unseat', disc: track.id });
    const backed = way.find((segment) => segment.phase === 'exiting')?.start ?? standAt;
    track.spin = [...track.spin, this.#uprightTurn(track.spin, backed, UPRIGHT_TURN_MS)];
  }

  /**
   * The visitor left while `track` was on its way into the player: it commits (DISC_MOTION.commit). What is left of
   * its flight plays at once, it waits flat in front of the radio until the well is clear, then slides in and drops:
   * each along its own path, only sooner, never faster than COMMIT_MAX_SPEED nor into a disc moving in front of the
   * shelf. Its landing, its sounds and the radio's press move with it.
   */
  #commit(track: DiscTrack, t: number): void {
    const insert = track.insert;
    if (!insert || insert.slideStart === null || insert.contact <= t) return;
    const { commit, pick } = DISC_MOTION;
    const film = track.segments.filter((segment) => segment.end > t);
    const path = (at: number) => poseOn(film, at).position;
    let before: PhasedSegment[] = [];
    let ready = t;
    if (insert.flown > t) {
      const span = insert.flown - t;
      for (let duration = commit.preMs; ; duration += RISE_WAIT_STEP_MS) {
        const warp = hurryWithin(path, t, t, span, duration, COMMIT_MAX_SPEED);
        before = warpSegments(film, warp);
        ready = warp.realEnd;
        if (warp.realEnd - t >= span || this.#clearOf(track, before, t, IN_FRONT)) break;
      }
    }
    const filmFrom = Math.max(t, insert.slideStart);
    const slideAt = filmFrom > t ? Math.max(ready, this.#wellClear(track, t)) : t;
    const hold: PhasedSegment[] =
      slideAt > ready ? [{ ...still(poseOn(film, filmFrom), ready, slideAt), phase: 'inserting' }] : [];
    const settled = insert.contact + pick.bounceMs;
    const post = hurryWithin(path, slideAt, filmFrom, settled - filmFrom, commit.postMs, COMMIT_MAX_SPEED);
    track.segments = [...before, ...hold, ...warpSegments(film, post)];
    this.#cancel(track.id, t);
    for (const other of this.#discs.values()) {
      other.bumps = other.bumps.filter((bump) => bump.start !== insert.contact);
    }
    track.spin = [this.#uprightFrom(track.spin, t, COMMIT_SPIN_SPRING)];
    const way = { flown: ready, slideStart: slideAt, dropStart: post.real(insert.dropStart) };
    this.#seatAt(track, { ...way, contact: post.real(insert.contact) }, t, true);
  }

  /** Leaving the player and not yet behind the shelf: landing, on the spindle, standing up, or backing off the seat. */
  #outOfPlayer(track: DiscTrack, t: number): boolean {
    const phase = this.#phaseAt(track, t);
    if (phase === 'dropping' || phase === 'seated' || phase === 'unseating') {
      return track.segments.some((segment) => segment.phase === 'unseating' && segment.end > t);
    }
    const back = track.segments.find((segment) => segment.phase === 'exiting');
    return phase === 'exiting' && back !== undefined && activeSegment(track.segments, t) === back;
  }

  /**
   * The short way home out of the player as the visitor leaves: it lands if it was landing, brakes (in
   * DISC_MOTION.slit.brakeMs at most), stands up, backs straight into the slit's plane (under the lanes the shelf waits
   * in) once the disc before it is down the slit (`after`), and goes down it. Returns when it starts down.
   */
  #downTheSlit(track: DiscTrack, t: number, after: number): number {
    const { slit } = DISC_MOTION;
    const phase = this.#phaseAt(track, t);
    const stand = track.segments.find((segment) => segment.phase === 'unseating');
    let kept: PhasedSegment[] = [];
    let spin = track.spin;
    if (stand && (phase === 'dropping' || phase === 'seated')) {
      const drop = track.segments.filter((segment) => segment.phase === 'dropping' && segment.end > t);
      const landed = Math.max(t, drop.at(-1)?.end ?? t);
      const standAt = Math.max(landed, Math.min(stand.start, t + slit.brakeMs));
      this.#moments = this.#moments.filter(
        (moment) => moment.owner !== track.id || moment.cue !== 'disc-unseat' || moment.at <= t,
      );
      this.#addMoment({ at: standAt, owner: track.id, cue: 'disc-unseat', disc: track.id });
      const live = spinAt(track.spin, t);
      const duration = Math.max(PLAN_STEP_MS, Math.min(slit.brakeMs, standAt - t));
      spin = [{ kind: 'ramp', t0: t, phi0: live.phi, omega0: live.omega, omega1: 0, duration, ease: 'out-cubic' }];
      const up = standUp(standAt);
      kept = [...drop, { ...still(seatPose(), landed, standAt), phase: 'seated' }, { ...up, phase: 'unseating' }];
      spin = [...spin, this.#uprightTurn(spin, up.end, UPRIGHT_TURN_MS)];
    } else if (stand && phase === 'unseating') {
      kept = track.segments.filter((segment) => segment.end > t && segment.end <= stand.end);
    }
    track.spin = spin;
    return this.#intoTheSlit(track, kept, t, after, 'unseating', 0);
  }

  /** Behind the shelf, across its plane on its way home from the player (not yet turning into its slot). */
  #acrossTheBack(track: DiscTrack, t: number): boolean {
    const exits = track.segments.filter((segment) => segment.phase === 'exiting');
    return exits.length > 2 && activeSegment(track.segments, t) === exits[1];
  }

  /**
   * Across the back on its way home from the player as the visitor leaves: it goes on across that plane (behind every
   * disc on the shelf, so it passes none) to over the slot instead, at its height and never faster than
   * COMMIT_MAX_SPEED, into the slot's plane once the disc before it is down the slot (`after`), and down it, the
   * `order`-th to. Returns when it starts down.
   */
  #acrossToSlit(track: DiscTrack, t: number, after: number, order: number): number {
    const from = this.#poseAt(track, t);
    const over = { x: SLIT_X, y: from.position.y };
    const ms = speedCappedMs(4 * PLAN_STEP_MS, DISC_MOTION.swap.acrossMs, (duration) =>
      across(from, over, t, duration),
    );
    const side = across(from, over, t, ms);
    this.#cancel(track.id, t);
    return this.#intoTheSlit(track, [{ ...side, phase: 'exiting' }], t, after, 'exiting', order);
  }

  /**
   * The end of a short way home as the visitor leaves: after `kept`, `track` waits (in `waiting`) until `after`, backs
   * straight into the slot's plane and goes down it, the `order`-th to. Returns when it starts down, or for a longer
   * drop, when a drop at the shelf's pace (DISC_MOTION.leave.sinkMs) would have started to end with it.
   */
  #intoTheSlit(
    track: DiscTrack,
    kept: readonly PhasedSegment[],
    t: number,
    after: number,
    waiting: DiscPhase,
    order: number,
  ): number {
    const last = kept.at(-1);
    const from = last ? last.at(last.end) : this.#poseAt(track, t);
    const fromAt = last?.end ?? t;
    const start = Math.max(fromAt, after);
    const depth = Math.abs(seatPose().position.z - DECK.slot.z);
    const drawn = DISC_MOTION.slit.backMs * clamp01(Math.abs(from.position.z - DECK.slot.z) / depth);
    // As drawn for its depth, but a disc high above the slot (across the back of a tall shelf) takes as long as its
    // drop needs at COMMIT_MAX_SPEED.
    const duration = speedCappedMs(Math.max(4 * PLAN_STEP_MS, drawn), Number.POSITIVE_INFINITY, (ms) =>
      toSlit(from, start, ms),
    );
    const toward = toSlit(from, start, duration);
    // Down from its own height, which across the back of a tall shelf is well above where the shelf sinks from: no
    // faster than COMMIT_MAX_SPEED either.
    const top = toward.at(toward.end);
    const { sinkMs } = DISC_MOTION.leave;
    const down = sink(
      top,
      toward.end,
      speedCappedMs(sinkMs, Number.POSITIVE_INFINITY, (ms) => sink(top, toward.end, ms)),
    );
    track.segments = [
      ...kept,
      ...(start > fromAt ? [{ ...still(from, fromAt, start), phase: waiting }] : []),
      { ...toward, phase: 'exiting' },
      { ...down, phase: 'returning' },
    ];
    track.rest = 'stowed';
    track.insert = null;
    track.setOff = null;
    this.#addMoment({ at: toward.end, owner: track.id, cue: 'disc-sink', order, disc: track.id });
    // As if it had started down at the shelf's pace: the next disc into the slot's plane waits until it is in.
    return down.end - sinkMs;
  }

  /** Turning into its slot on its way home from the player as the visitor leaves: the rest of its way plays sooner. */
  #hurryHome(track: DiscTrack, t: number): void {
    const film = track.segments.filter((segment) => segment.end > t);
    const end = film.at(-1)?.end ?? t;
    const path = (at: number) => poseOn(film, at).position;
    track.segments = warpSegments(film, hurryWithin(path, t, t, end - t, DISC_MOTION.commit.ms, COMMIT_MAX_SPEED));
  }

  /** The first moment every disc leaving the player is out of the way of `incoming` sliding in over the seat. */
  #wellClear(incoming: DiscTrack, t: number): number {
    const slideY = approachPoint().y + DISC_MOTION.swap.clearance;
    let clear = t;
    for (const track of this.#discs.values()) {
      if (track === incoming) continue;
      const leaving = track.segments.filter(
        (segment) => segment.end > t && (segment.phase === 'unseating' || segment.phase === 'exiting'),
      );
      const last = leaving.at(-1);
      if (!last) continue;
      let at = Math.max(t, leaving[0]?.start ?? t);
      while (at < last.end && lowestY(this.#poseAt(track, at)) < slideY) at += PLAN_STEP_MS;
      clear = Math.max(clear, Math.min(at, last.end));
    }
    return clear;
  }

  /**
   * What is left at `t` of a rising disc's way out: up out of the slot and over to its own column, where the way to
   * the seat is clear of the discs still coming up behind it (the sweep checks it). Not the turn into its slot.
   */
  #wayUp(track: DiscTrack, t: number): PhasedSegment[] {
    // Only while it is still the disc's plan (a leave or a turn back replaces it).
    return track.climb?.way.filter((segment) => segment.end > t && track.segments.includes(segment)) ?? [];
  }

  /** When every disc called back in front of the shelf is home (an incoming disc waits for that), `t` if none. */
  #homingDone(incoming: DiscTrack, t: number): number {
    let done = t;
    for (const track of this.#discs.values()) {
      if (track === incoming) continue;
      for (const segment of track.segments) {
        if (segment.phase === 'homing' && segment.end > t) done = Math.max(done, segment.end);
      }
    }
    return done;
  }

  #spinUp(track: DiscTrack, at: number, duration: number): void {
    const from = spinAt(track.spin, at);
    track.spin = spinThen(track.spin, at, {
      kind: 'ramp',
      t0: at,
      phi0: from.phi,
      omega0: from.omega,
      omega1: DISC_MOTION.playSpeed,
      duration,
      ease: 'smooth',
    });
    this.#addMoment({ at, owner: `spin:${track.id}`, cue: 'spin-up', disc: track.id });
  }

  #spinDown(track: DiscTrack, at: number, duration: number): void {
    const from = spinAt(track.spin, at);
    track.spin = spinThen(track.spin, at, {
      kind: 'ramp',
      t0: at,
      phi0: from.phi,
      omega0: from.omega,
      omega1: 0,
      duration,
      ease: 'out-cubic',
    });
    if (Math.abs(from.omega) > 0.5)
      this.#addMoment({ at, owner: `spin:${track.id}`, cue: 'spin-down', disc: track.id });
  }

  /** A floating disc's idle spin, ramped in from its live speed (none when calm). */
  #idleSpin(track: DiscTrack, t: number): SpinTrack {
    const live = spinAt(track.spin, t);
    const omega = this.#calm() ? 0 : track.character.spin;
    return [
      { kind: 'ramp', t0: t, phi0: live.phi, omega0: live.omega, omega1: omega, duration: WAKE_MS, ease: 'smooth' },
    ];
  }

  /** The spin winding down to label-upright (attention, homing; a slow idle spin may turn back to it). */
  #labelSpin(track: DiscTrack, t: number): SpinTrack {
    return [this.#uprightTurn(track.spin, t, UPRIGHT_TURN_MS, { mayTurnBack: true })];
  }

  /** A turn to label-upright from the live spin at `t` that stays out of the spin blur (springs.uprightTurn). */
  #uprightTurn(
    spin: SpinTrack,
    t: number,
    nominalMs: number,
    bounds: { readonly withinMs?: number; readonly mayTurnBack?: boolean } = {},
  ): SpinSegment {
    const live = spinAt(spin, t);
    return uprightTurn(t, live.phi, live.omega, { nominalMs, maxSpeed: BLUR_FROM, ...bounds });
  }

  #uprightFrom(spin: SpinTrack, t: number, spring: { readonly zeta: number; readonly hz: number }): SpinSegment {
    const live = spinAt(spin, t);
    return {
      kind: 'settle',
      t0: t,
      phi0: live.phi,
      omega0: live.omega,
      target: uprightTarget(live.phi, live.omega),
      zeta: spring.zeta,
      hz: spring.hz,
    };
  }

  #decaySpin(track: DiscTrack, t: number, omega: number): SpinTrack {
    const live = spinAt(track.spin, t);
    return [{ kind: 'decay', t0: t, phi0: live.phi, omega0: live.omega, omega1: omega, tau: DISC_MOTION.glideSpinTau }];
  }

  /** The spin, settling to label-upright when the float comes to rest at `at`. */
  #restSpin(spin: SpinTrack, now: number, at: number): SpinTrack {
    const kept = spin.filter((segment) => segment.t0 <= now || segment.t0 < at);
    // Gently, ahead only (a resting disc does not turn back), and never into the blur.
    return [...kept, this.#uprightTurn(kept, at, REST_MS)];
  }

  #restStartAfter(t: number): number {
    const rest = this.#amplitude.find((entry) => entry.a1 === 0 && entry.from >= t);
    return rest?.from ?? t;
  }

  /**
   * The disc's slot is now `slot`. The camera re-frames the radio in this same frame (the rig holds its new pose), so a
   * disc at rest is drawn at its new slot at once, with the picture: a glide would drift the shelf across a picture that
   * has already cut, and a straight glide between two layouts crosses the neighbours. True when the disc is on its way
   * to the old slot and has to glide over once there (#glideLate).
   */
  #relaySlot(track: DiscTrack, slot: DiscSlot, moved: boolean, t: number): boolean {
    track.slot = slot;
    if (!moved || track.rest !== 'floating') return false;
    const last = track.segments.at(-1);
    return last !== undefined && last.end > t;
  }

  /**
   * Glides each disc still on its way to an old slot over to its new one once there, first come first served: a glide
   * waits (in the old slot) in RISE_WAIT_STEP_MS steps until it is clear of every other disc's way, including the
   * discs still waiting in their old slots, so a shelf re-laid out mid-rise never has two discs pass through each other.
   * Two discs can each sit in the other's way (one's new slot is where the other waits): the first of them then steps
   * out of the shelf towards the camera, lets the other by, and glides on from there.
   */
  #glideLate(late: DiscTrack[]): void {
    const endOf = (track: DiscTrack) => track.segments.at(-1)?.end ?? 0;
    type Turn = { readonly track: DiscTrack; readonly tries: number };
    const queue: Turn[] = [...late].sort((a, b) => endOf(a) - endOf(b)).map((track) => ({ track, tries: 0 }));
    const waiting = new Set(late);
    const eye = this.#options.eye();
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { track, tries } = next;
      const last = track.segments.at(-1);
      if (!last) continue;
      waiting.delete(track);
      const from = last.at(last.end);
      const goal = slotPose(track.slot);
      goal.orientation.copy(slotFacing(track.slot, labelAway(from.orientation)));
      const others = [...this.#discs.values()].filter((other) => other !== track);
      const ways = others.map((other) => this.#wayAndRest(other, waiting.has(other)));
      // Every start tried below samples the same moments of the others' ways: each is worked out once.
      const placed = onGrid(last.end, (at) => ways.map((way) => activeSegment(way, at)?.at(at) ?? null));
      // Once every other disc's planned move is over the shelf stands still: a glide blocked then stays blocked.
      const settled = Math.max(last.end, ...others.map(endOf));
      const horizon = Math.min(last.end + RELAYOUT_MAX_WAIT_MS, settled + RISE_WAIT_STEP_MS);
      const forward = eye.clone().sub(from.position.clone().lerp(goal.position, 0.5)).normalize();
      const depth = RELAYOUT_BOWS.at(-1) ?? 0;
      // Stepped aside: across in front of the shelf, then straight back into the new slot.
      const frontRoute = (start: number): PhasedSegment[] => {
        const front = clonePose(goal);
        front.position.addScaledVector(forward, depth);
        return [
          { ...ease(from, front, start, DISC_MOTION.relayoutMs), phase: 'floating' },
          { ...ease(front, goal, start + DISC_MOTION.relayoutMs, DISC_MOTION.relayoutMs / 2), phase: 'floating' },
        ];
      };
      // The same glide whatever moment it sets off (ease is a function of the time since): checked from its poses at
      // the first possible start, shifted, and only built for real once a start is clear.
      const tryEach = (makes: readonly ((start: number) => PhasedSegment[])[]) => {
        const checks = makes.map((make) => shiftedCheck(make(last.end), last.end, placed));
        return (start: number) => {
          const index = checks.findIndex((clear) => clear(start));
          return index < 0 ? undefined : makes[index]?.(start);
        };
      };
      // Straight over, or bowed towards the camera to pass in front of a disc in the way (a disc is thin that way).
      const glides = [undefined, ...RELAYOUT_BOWS.map((size) => forward.clone().multiplyScalar(size))].map(
        (bow) =>
          (start: number): PhasedSegment[] => [
            { ...ease(from, goal, start, DISC_MOTION.relayoutMs, bow), phase: 'floating' },
          ],
      );
      const found = firstClear(last.end, horizon, tryEach(tries === 2 ? [frontRoute] : glides));
      const blockedByWaiting = !found && queue.some((turn) => waiting.has(turn.track));
      if (blockedByWaiting && tries === 0) {
        waiting.add(track);
        queue.push({ track, tries: 1 });
        continue;
      }
      if (blockedByWaiting && tries === 1) {
        // Out of the shelf's plane towards the camera, out of everyone's way, to wait there for its own.
        const aside = clonePose(from);
        aside.position.addScaledVector(forward, depth);
        const out = (start: number): PhasedSegment[] => [
          { ...ease(from, aside, start, DISC_MOTION.relayoutMs / 2), phase: 'floating' },
        ];
        const step = firstClear(last.end, horizon, tryEach([out]));
        if (step) {
          this.#goOn(track, last.end, step);
          waiting.add(track);
          queue.push({ track, tries: 2 });
          continue;
        }
      }
      // Nothing clear by gliding over (a disc resting in the way, or each in the other's): around the shelf instead,
      // out of it, across and back in, in front of it or (where the disc in front of this one overlaps it) behind it,
      // at the first start that is clear, else once the shelf stands still.
      const around =
        (side: 1 | -1) =>
        (start: number): PhasedSegment[] => {
          const out = clonePose(from);
          out.position.addScaledVector(forward, side * depth);
          const over = clonePose(goal);
          over.position.addScaledVector(forward, side * depth);
          const half = DISC_MOTION.relayoutMs / 2;
          return [
            { ...ease(from, out, start, half), phase: 'floating' },
            { ...ease(out, over, start + half, DISC_MOTION.relayoutMs), phase: 'floating' },
            { ...ease(over, goal, start + half + DISC_MOTION.relayoutMs, half), phase: 'floating' },
          ];
        };
      const fallback = (): PhasedSegment[] => {
        if (tries === 2) return frontRoute(horizon);
        return firstClear(last.end, horizon, tryEach([around(1), around(-1)])) ?? around(1)(horizon);
      };
      this.#goOn(track, last.end, found ?? fallback());
    }
  }

  /** Appends `way` to the disc's segments, holding it still from `end` (where its move ends) until the way sets off. */
  #goOn(track: DiscTrack, end: number, way: readonly PhasedSegment[]): void {
    const first = way[0];
    const segments: PhasedSegment[] = [
      ...(first && first.start > end
        ? [{ ...still(first.at(first.start), end, first.start), phase: 'floating' as const }]
        : []),
      ...way,
    ];
    for (const segment of segments) this.#relayGlides.add(segment);
    track.segments.push(...segments);
  }

  /** A disc's planned way, then where it stays (its old slot while it waits to glide, else where its way ends). */
  #wayAndRest(track: DiscTrack, waiting: boolean): PhasedSegment[] {
    const last = track.segments.at(-1);
    const end = last?.end ?? Number.NEGATIVE_INFINITY;
    if (!waiting && track.rest !== 'floating') return [...track.segments];
    const pose = waiting && last ? last.at(last.end) : slotPose(track.slot);
    return [...track.segments, { ...still(pose, end), phase: 'floating' }];
  }

  #leanNeighbours(t: number, reduced: boolean): void {
    const attended = this.#attended === null ? undefined : this.#discs.get(this.#attended);
    for (const track of this.#discs.values()) {
      const neighbour =
        attended !== undefined &&
        track !== attended &&
        track.slot.row === attended.slot.row &&
        Math.abs(track.index - attended.index) === 1;
      const lean = neighbour ? Math.sign(track.slot.position.x - attended.slot.position.x) : 0;
      if (reduced) track.lean.set(t, 0);
      else track.lean.retarget(t, lean);
    }
  }

  #isFloating(id: string, t: number): boolean {
    const track = this.#discs.get(id);
    return track !== undefined && this.#phaseAt(track, t) === 'floating';
  }

  #phaseAt(track: DiscTrack, t: number): DiscPhase {
    return activeSegment(track.segments, t)?.phase ?? track.rest;
  }

  /** A disc's pose at `t` before its float, attention and spin. */
  #poseAt(track: DiscTrack, t: number): DiscPose {
    const segment = activeSegment(track.segments, t);
    if (segment) return segment.at(t);
    if (track.rest === 'stowed') return hiddenPose();
    if (track.rest === 'seated') return seatPose();
    return slotPose(track.slot);
  }

  /** A disc as drawn at `t` (its float, attention, lean, tilt and bumps), before its spin. */
  #drawnPose(track: DiscTrack, t: number): DiscPose {
    return this.#drawn(track, t, this.#amplitudeAt(t)).pose;
  }

  #drawn(track: DiscTrack, t: number, amplitude: number): { pose: DiscPose; phase: DiscPhase; floating: boolean } {
    const segment = activeSegment(track.segments, t);
    const phase = segment?.phase ?? track.rest;
    const base = segment ? segment.at(t) : this.#poseAt(track, t);
    const position = base.position.clone();
    let orientation = base.orientation.clone();
    let scale = base.scale;
    const floating = phase === 'floating';
    if (floating) {
      const eye = this.#options.eye();
      const a = clamp01(track.attention.value(t));
      const attention = attentionPose(track.slot, eye);
      position.lerp(attention.position, a);
      orientation.slerp(attention.orientation, a);
      scale += (attention.scale - 1) * a;
      // A disc still settling into its slot takes on the float gradually, so the float never jumps in.
      const float = amplitude * (segment ? clamp01((t - segment.start) / (segment.end - segment.start)) : 1);
      const idle = idleOffset(track.character, t, float);
      position.y += idle.y;
      orientation = idle.wobble.multiply(orientation);
      const lean = track.lean.value(t);
      position.addScaledVector(X.clone().applyAxisAngle(UP, track.slot.yaw), lean * LEAN_PART);
      orientation = new Quaternion().setFromAxisAngle(UP, lean * LEAN_ANGLE).multiply(orientation);
      orientation
        .multiply(new Quaternion().setFromAxisAngle(X, -track.tiltX.value(t)))
        .multiply(new Quaternion().setFromAxisAngle(UP, track.tiltY.value(t)));
      position.x += this.#parallaxX.value(t) * float;
      position.y += this.#parallaxY.value(t) * float;
    }
    for (const bump of track.bumps) {
      if (t <= bump.start || t >= bump.start + bump.duration) continue;
      position.addScaledVector(bump.offset, bumpWeight(bump, t));
    }
    return { pose: { position, orientation, scale }, phase, floating };
  }

  #amplitudeAt(t: number): number {
    let value = 0;
    for (const entry of this.#amplitude) {
      if (entry.from > t) break;
      value =
        entry.duration <= 0 ? entry.a1 : entry.a0 + (entry.a1 - entry.a0) * clamp01((t - entry.from) / entry.duration);
    }
    return value;
  }

  #lidPlanAt(t: number): LidPlan {
    let plan: LidPlan = { kind: 'closed' };
    for (const entry of this.#lidPlans) if (entry.from <= t) plan = entry.plan;
    return plan;
  }

  /** The lid follows `plan` from `from` on (decided at `t`); later plans and moments are dropped. */
  #setLid(t: number, plan: LidPlan, from: number): void {
    this.#lidPlans = this.#lidPlans.filter((entry) => entry.from < from && entry.from <= t);
    this.#lidPlans.push({ from, plan });
    this.#moments = this.#moments.filter((moment) => moment.owner !== 'lid' || moment.at <= t || moment.at < from);
    for (const moment of lidMoments(plan)) {
      if (moment.at >= from && moment.at >= t)
        this.#addMoment({ at: moment.at, owner: 'lid', cue: moment.cue, part: 'lid' });
    }
  }

  #addMoment(moment: Moment): void {
    this.#moments.push(moment);
  }

  /** Drops a disc's future moments (a retarget: a superseded insert never fires). */
  #cancel(id: string, t: number): void {
    this.#moments = this.#moments.filter(
      (moment) => (moment.owner !== id && moment.owner !== `spin:${id}`) || moment.at <= t,
    );
  }
}

/** True when a disc in this orientation shows its data side to the camera (its label faces away). */
/** How far `a` moved relative to `b` in one step (from `a0`, `b0`). */
function relativeStep(a: Vector3, a0: Vector3, b: Vector3, b0: Vector3): number {
  const x = a.x - a0.x - (b.x - b0.x);
  const y = a.y - a0.y - (b.y - b0.y);
  const z = a.z - a0.z - (b.z - b0.z);
  return Math.sqrt(x * x + y * y + z * z);
}

/** The first way `at(start)` offers for a start from `from` on, in RISE_WAIT_STEP_MS steps up to `until`. */
function firstClear(
  from: number,
  until: number,
  at: (start: number) => PhasedSegment[] | undefined,
): PhasedSegment[] | undefined {
  for (let start = from; start <= until; start += RISE_WAIT_STEP_MS) {
    const move = at(start);
    if (move) return move;
  }
  return undefined;
}

/** True when a disc following `segments` from `t` meets none of the discs following `ways`. */
function clearOfWays(
  segments: readonly PhasedSegment[],
  ways: readonly (readonly PhasedSegment[])[],
  t: number,
  margin = RISE_MARGIN,
): boolean {
  return clearAlong(segments, t, (at) => ways.map((way) => activeSegment(way, at)?.at(at) ?? null), margin);
}

/**
 * `others`, remembered on the PLAN_STEP_MS grid from `origin`: a search that tries start after start on that grid (as
 * firstClear does, in RISE_WAIT_STEP_MS steps) works each moment of the other discs' ways out once, not once per try.
 * The poses it hands out are shared: callers read them, never change them.
 */
function onGrid<T>(origin: number, others: (at: number) => T): (at: number) => T {
  const memo = new Map<number, T>();
  return (at) => {
    const steps = (at - origin) / PLAN_STEP_MS;
    const index = Math.round(steps);
    if (Math.abs(steps - index) > 1e-6) return others(at);
    let placed = memo.get(index);
    if (placed === undefined) {
      placed = others(at);
      memo.set(index, placed);
    }
    return placed;
  };
}

/**
 * clearAlong for `way` (planned to set off at `origin`) set off at any later start on the RISE_WAIT_STEP_MS grid
 * instead: a way that is a function of the time since its start (as ease is) only needs its poses worked out once.
 */
function shiftedCheck(
  way: readonly PhasedSegment[],
  origin: number,
  others: (at: number) => readonly (DiscPose | null)[],
): (start: number) => boolean {
  const poses = onGrid(origin, (at) => poseOn(way, at));
  const length = (way.at(-1)?.end ?? origin) - origin;
  return (start) => clearOver((at) => poses(at - start + origin), start, start + length, others);
}

/**
 * True when a disc following `segments` from `t` keeps `margin` clear of the discs `others` places at each step (null
 * where there is none), sampled every PLAN_STEP_MS. Where a pair moved more than the margin relative to each other since
 * the step before, the moments in between are checked too, so two discs passing face to face through each other between
 * steps (in one plane they touch only for a millisecond or two) count.
 */
function clearAlong(
  segments: readonly PhasedSegment[],
  t: number,
  others: (at: number) => readonly (DiscPose | null)[],
  margin = RISE_MARGIN,
): boolean {
  return clearOver((at) => poseOn(segments, at), t, segments.at(-1)?.end ?? t, others, margin);
}

/**
 * clearAlong for a disc whose pose at each moment from `t` to `end` is `self`. A way that meets another disc mostly
 * does so for several steps running, so a first pass every CLEAR_COARSE_STEPS steps turns most of the starts a search
 * tries down in a few samples (a glide blocked where it arrives, not only one blocked where it sets off); the second
 * pass checks the steps in between.
 * Each sample is worked out once, and the answer is the same as one pass in order.
 */
function clearOver(
  self: (at: number) => DiscPose,
  t: number,
  end: number,
  others: (at: number) => readonly (DiscPose | null)[],
  margin = RISE_MARGIN,
): boolean {
  const count = Math.max(0, Math.ceil((end - t) / PLAN_STEP_MS - 1e-9));
  const mine: DiscPose[] = [];
  const theirs: (readonly (DiscPose | null)[])[] = [];
  const poseAt = (k: number) => (mine[k] ??= self(t + k * PLAN_STEP_MS));
  const othersAt = (k: number) => (theirs[k] ??= others(t + k * PLAN_STEP_MS));
  // Between step k - 1 and step k, at `steps` evenly spaced moments: does the pair `i` touch?
  const meetsBetween = (k: number, i: number, steps: number): boolean => {
    for (let j = 1; j < steps; j++) {
      const at = t + (k - 1 + j / steps) * PLAN_STEP_MS;
      const other = others(at)[i];
      if (other && discsTouch(self(at), other, margin)) return true;
    }
    return false;
  };
  const meets = (k: number): boolean => {
    const pose = poseAt(k);
    const now = othersAt(k);
    const previous = k > 0 ? poseAt(k - 1).position : null;
    const before = k > 0 ? othersAt(k - 1) : [];
    for (let i = 0; i < now.length; i++) {
      const other = now[i];
      if (!other) continue;
      const last = before[i];
      const closing = last && previous ? relativeStep(pose.position, previous, other.position, last.position) : 0;
      // Out of reach even allowing for the way the pair moved since the step before: nothing to check.
      if (other.position.distanceTo(pose.position) >= DISC_RADIUS * (pose.scale + other.scale) + margin + closing) {
        continue;
      }
      if (discsTouch(pose, other, margin)) return true;
      // A pair that moved more than the margin relative to each other since the step before may have passed through
      // each other in between (face to face, they touch only for a millisecond or two): look at the moments in between,
      // close enough that the pair moves at most the margin from one to the next. Exact where a wider margin would
      // hold a disc back from ways that are clear.
      if (closing > margin && meetsBetween(k, i, Math.ceil(closing / margin))) return true;
    }
    return false;
  };
  for (let k = 0; k < count; k += CLEAR_COARSE_STEPS) if (meets(k)) return false;
  for (let k = 0; k < count; k++) if (k % CLEAR_COARSE_STEPS !== 0 && meets(k)) return false;
  return true;
}

/**
 * How long a move drawn in `ms` takes at `pace`: shorter below 1, but never so short that `move` (planned for a
 * duration) goes faster than COMMIT_MAX_SPEED, nor longer than as drawn. The leave hurries; it never jumps.
 */
function pacedMs(ms: number, pace: number, move: (duration: number) => PoseSegment): number {
  return pace >= 1 ? ms * pace : speedCappedMs(ms * pace, ms, move);
}

/** The shortest duration from `shortest` to `longest` in which `move` (planned for one) is no faster than COMMIT_MAX_SPEED. */
function speedCappedMs(shortest: number, longest: number, move: (duration: number) => PoseSegment): number {
  const segment = move(shortest);
  const peak = peakSpeed((at) => segment.at(at).position, hurry(segment.start, segment.start, shortest, shortest), 4);
  return Math.min(longest, Math.max(shortest, (shortest * peak) / COMMIT_MAX_SPEED));
}

function labelAway(orientation: Quaternion): boolean {
  return Z.clone().applyQuaternion(orientation).z < 0;
}

/** A slot's resting orientation, label out or data side out. */
function slotFacing(slot: DiscSlot, dataSide: boolean): Quaternion {
  const orientation = slotOrientation(slot);
  return dataSide ? orientation.multiply(new Quaternion().setFromAxisAngle(UP, Math.PI)) : orientation;
}

function groupOf(key: RadioKey): 'rocker' | 'previous' | 'next' {
  return key === 'previous' || key === 'next' ? key : 'rocker';
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** When a disc leaving the player stands up (the one that does first goes down the slit first). */
function unseatStart(track: DiscTrack): number {
  return track.segments.find((segment) => segment.phase === 'unseating')?.start ?? Number.POSITIVE_INFINITY;
}

function activeSegment(segments: readonly PhasedSegment[], t: number): PhasedSegment | undefined {
  for (const segment of segments) if (t >= segment.start && t < segment.end) return segment;
  return undefined;
}

/** The pose a list of segments gives at `t`, the nearest segment's end or start outside them. */
function poseOn(segments: readonly PhasedSegment[], t: number): DiscPose {
  const active = activeSegment(segments, t);
  if (active) return active.at(t);
  const before = segments.filter((segment) => segment.end <= t).at(-1);
  if (before) return before.at(before.end);
  const first = segments[0];
  if (!first) throw new Error('No way to retrace');
  return first.at(first.start);
}

/** A spin winding to label-upright: a resting disc picks its idle spin back up from one when the float wakes. */
function isUprightWindDown(segment: SpinSegment): boolean {
  return segment.kind === 'turn' || segment.kind === 'settle';
}

function spinSegmentAt(track: SpinTrack, t: number): SpinSegment {
  let current = track[0];
  for (const segment of track) if (segment.t0 <= t) current = segment;
  if (!current) throw new Error('A spin track needs a segment');
  return current;
}
