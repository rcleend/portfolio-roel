import { Quaternion, Vector3 } from 'three';
import { clamp01 } from '../../motion/easing';
import type { DiscSlot } from '../discLayout';
import type { RadioCue, RadioKey, Transport } from '../RadioDeck';
import { slotOrientation } from '../radioFraming';
import {
  across,
  anticipate,
  apexPose,
  approachPoint,
  attentionPose,
  backOut,
  backToExit,
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
  seatPose,
  settle,
  sink,
  slide,
  slotPose,
  standUp,
  still,
  underShelf,
} from './discMotion';
import { type KeyPress, keyMoving, keyTravel, releaseStart } from './keyMotion';
import { closeFrom, LID_DISC_GATE_DEGREES, type LidPlan, lidAt, lidMoments, lidReaches, openFrom } from './lidMotion';
import { type SpinSegment, type SpinTrack, Spring, spinAt, spinChanging, spinThen, uprightTarget } from './springs';

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
  readonly dropStart: number;
  readonly contact: number;
  /** ▷II's press bottom: the sound may start. */
  readonly bottom: number;
}

interface DiscTrack {
  readonly id: string;
  index: number;
  slot: DiscSlot;
  readonly character: IdleCharacter;
  segments: PhasedSegment[];
  rest: Rest;
  spin: SpinTrack;
  insert: Insert | null;
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
const UPRIGHT_SPRING = { zeta: 0.8, hz: 3 } as const;
/** Resting discs settle their spin to label-upright gently, over about REST_MS. */
const REST_SPIN_SPRING = { zeta: 0.85, hz: 0.9 } as const;
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

  /** The collection in display order with its slots; new discs wait inside the radio, the others re-lay. */
  setDiscs(ids: readonly string[], slots: readonly DiscSlot[], t: number): void {
    const next = new Map<string, DiscTrack>();
    ids.forEach((id, index) => {
      const slot = slots[index];
      if (!slot || next.has(id)) return;
      const existing = this.#discs.get(id);
      if (existing) {
        const moved = existing.slot.position.distanceTo(slot.position) > 1e-6;
        existing.index = index;
        existing.slot = slot;
        if (moved) this.#relaySlot(existing, t);
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

  /** The viewport or insets changed: every disc ends up in its new slot, those in motion once their move is done. */
  relayout(slots: readonly DiscSlot[], t: number): void {
    this.#order.forEach((id, index) => {
      const track = this.#discs.get(id);
      const slot = slots[index];
      if (!track || !slot) return;
      const moved = track.slot.position.distanceTo(slot.position) > 1e-6 || track.slot.tilt !== slot.tilt;
      track.slot = slot;
      if (moved) this.#relaySlot(track, t);
    });
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
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded || track.rest !== 'stowed' || !track.segments.some((s) => s.end > t)) continue;
      const setOff = track.setOff ?? t;
      track.setOff = null;
      this.#cancel(track.id, t);
      const way = track.segments;
      const back = Math.max(0, t - setOff);
      track.segments =
        back > 0 ? [{ start: t, end: t + back, at: (at: number) => poseOn(way, 2 * t - at), phase: 'rising' }] : [];
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

  /** The camera is asked to leave: an insert under way lands, then the discs go home one by one and the lid shuts. */
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
    // The insert the visitor asked for finishes as planned (its seated moment still fires); the shelf waits for it.
    const loaded = this.#loaded === null ? undefined : this.#discs.get(this.#loaded);
    const insertDown = loaded?.insert ? loaded.insert.contact + DISC_MOTION.pick.bounceMs : t;
    // Discs still on their way to their slots get there first: they go home from where they rest.
    let arriving = t;
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded || track.rest !== 'floating') continue;
      for (const segment of track.segments) if (segment.end > t) arriving = Math.max(arriving, segment.end);
    }
    const begin = Math.max(t, insertDown, arriving);
    let closeAt = begin;
    const going: DiscTrack[] = [];
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded) continue;
      if (this.#phaseAt(track, t) === 'stowed' && !track.segments.some((segment) => segment.end > t)) {
        // Still inside the radio (a rise that had not started): it stays there.
        this.#cancel(track.id, t);
        track.segments = [];
        track.rest = 'stowed';
      } else {
        going.push(track);
      }
    }
    // The nearest home first, so no disc passes a slot still taken (and so none passes a disc turning over in its
    // slot: the ones before it are already on their way to the slot); each waits for the last to be down the slot.
    const order = riseOrder(going.map((track) => track.slot)).reverse();
    let lastSink = Number.NEGATIVE_INFINITY;
    order.forEach((index, k) => {
      const track = going[index];
      if (!track) return;
      // Each in turn, from its slot (one still arriving gets there first).
      const start = begin + DISC_MOTION.leave.stagger * k;
      this.#cancel(track.id, t);
      const arrival = track.segments.filter((segment) => segment.end > t);
      const waitFrom = arrival.at(-1)?.end ?? t;
      // It floats on in its slot until its turn, and goes from exactly where it floats then.
      track.segments = [...arrival, { ...still(slotPose(track.slot), waitFrom, start), phase: 'floating' }];
      track.setOff = start;
      const lane = leaveLane(k);
      const out = outOf(this.#drawnPose(track, start), track.slot, lane, start, DISC_MOTION.leave.outMs);
      const hover = hoverPose(track.slot, lane);
      const side = across(out.at(out.end), hover.position, out.end, DISC_MOTION.leave.acrossMs);
      const sinkAt = Math.max(side.end, lastSink + DISC_MOTION.leave.sinkGap);
      lastSink = sinkAt;
      const waitPose = side.at(side.end);
      const down = sink(waitPose, sinkAt);
      track.segments.push(
        { ...out, phase: 'returning' },
        { ...side, phase: 'returning' },
        { ...still(waitPose, side.end, sinkAt), phase: 'returning' },
        { ...down, phase: 'returning' },
      );
      track.rest = 'stowed';
      track.insert = null;
      track.spin = this.#decaySpin(track, t, 0);
      this.#addMoment({ at: sinkAt, owner: track.id, cue: 'disc-sink', order: k, disc: track.id });
      // The lid starts down as the last disc starts down the slot: it falls slowly at first, and is still behind
      // the slot's plane when the disc is in (the sweep checks it).
      closeAt = Math.max(closeAt, down.start + DISC_MOTION.leave.lidAfterSinkMs);
    });
    this.#setLid(t, closeFrom(this.#lidPlanAt(closeAt), closeAt), closeAt);
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
    const arriving = !instant && (phase === 'stowed' || phase === 'rising') ? this.#wayUp(incoming, t) : [];
    const fromRise = !instant && (phase === 'stowed' || phase === 'rising');
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
    // on in its slot, and anticipates as it sets off.
    const wellClear = this.#wellClear(incoming, t);
    const anticipationMs = fromRise ? 0 : pick.anticipationMs;
    const setOff = Math.max(
      arrived + anticipationMs,
      this.#homingDone(incoming, t),
      wellClear - DISC_MOTION.swap.aimMs - pick.flightMs,
    );
    const wait = Math.max(0, setOff - arrived - anticipationMs);
    const from = wait > 0 ? this.#drawnPose(incoming, arrived + wait) : live;
    const waitPose = fromRise ? live : slotPose(incoming.slot);
    // Coming out of the radio is the wind-up: a disc picked on its way flies on from its column.
    const antic = fromRise ? still(from, arrived + wait, arrived + wait) : anticipate(from, eye, arrived + wait);
    const departure = antic.end;
    const ready = antic.at(antic.end);
    const fly = insertFlight(ready, eye, departure, pick.flightMs);
    // It slides over the seat once every disc leaving the player (behind the shelf) is clear of its way.
    const slideStart = Math.max(fly.end, wellClear);
    const over = slide(0, slideStart);
    const dropStart = over.end;
    const fall = drop(approachPoint(), dropStart);
    const contact = dropStart + pick.dropMs;
    const pressDown = contact + pick.pressAfter;
    const bottom = pressDown + pick.pressDownMs;
    incoming.segments = [
      ...arriving,
      ...(wait > 0 ? [{ ...still(waitPose, arrived, arrived + wait), phase: 'floating' as const }] : []),
      { ...antic, phase: 'inserting' },
      { ...fly, phase: 'inserting' },
      { ...still(fly.at(fly.end), fly.end, slideStart), phase: 'inserting' },
      { ...over, phase: 'inserting' },
      { ...fall, phase: 'dropping' },
    ];
    incoming.rest = 'seated';
    incoming.insert = { dropStart, contact, bottom };
    // The label winds to upright in flight and lies still on the spindle until ▷II goes down.
    incoming.spin = [this.#uprightFrom(incoming.spin, antic.end, UPRIGHT_SPRING)];
    this.#addMoment({ at: t, owner: incoming.id, cue: 'disc-pick', disc: incoming.id });
    this.#addMoment({ at: contact, owner: incoming.id, cue: 'disc-seat', disc: incoming.id });
    // At contact the shelf dips in sympathy.
    for (const other of this.#discs.values()) {
      if (other !== incoming)
        other.bumps.push({
          start: contact,
          duration: SYMPATHY_MS,
          offset: new Vector3(0, -SYMPATHY_DIP, 0),
          attack: SYMPATHY_MS / 2,
          release: SYMPATHY_MS / 2,
        });
    }
    // The radio presses its own ▷II once the disc is down: slowly in, to the bottom (the sound starts), held, up.
    this.press('play-pause', pressDown, bottom + pick.pressHoldMs, {
      owner: incoming.id,
      inMs: pick.pressDownMs,
    });
    this.#addMoment({ at: bottom, owner: incoming.id, seated: true, disc: incoming.id });
    if (this.#transport === 'playing') this.#spinUp(incoming, bottom, SPIN_UP_MS.insert);
  }

  /**
   * Picked again while still in the player or on its way out of it (a keyboard can do that): it stays, or goes back
   * onto the spindle the way it came (its way out, backwards), and ▷II presses itself. False if it is not there.
   */
  #backIntoPlayer(track: DiscTrack, t: number): boolean {
    const phase = this.#phaseAt(track, t);
    if (phase !== 'seated' && phase !== 'dropping' && phase !== 'unseating' && phase !== 'exiting') return false;
    const { pick } = DISC_MOTION;
    const way = track.segments;
    const out = way.find((segment) => segment.phase === 'unseating');
    let contact: number;
    if (out && out.start < t) {
      // Already standing up or going: back down its own way, as long as it has been going.
      const back = t - out.start;
      track.segments = [{ start: t, end: t + back, at: (at: number) => poseOn(way, 2 * t - at), phase: 'dropping' }];
      contact = t + back;
    } else {
      // Still landing or on the spindle: it stays (its landing, if any, carries on).
      track.segments = way.filter((segment) => segment.end > t && segment.phase === 'dropping');
      contact = Math.max(t, track.segments.at(-1)?.end ?? t);
    }
    this.#cancel(track.id, t);
    track.rest = 'seated';
    const pressDown = contact + pick.pressAfter;
    const bottom = pressDown + pick.pressDownMs;
    track.insert = { dropStart: t, contact, bottom };
    const live = spinAt(track.spin, t);
    track.spin = [
      { kind: 'ramp', t0: t, phi0: live.phi, omega0: live.omega, omega1: 0, duration: 200, ease: 'out-cubic' },
    ];
    if (contact > t) this.#addMoment({ at: contact, owner: track.id, cue: 'disc-seat', disc: track.id });
    this.press('play-pause', pressDown, bottom + pick.pressHoldMs, { owner: track.id, inMs: pick.pressDownMs });
    this.#addMoment({ at: bottom, owner: track.id, seated: true, disc: track.id });
    if (this.#transport === 'playing') this.#spinUp(track, bottom, SPIN_UP_MS.insert);
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
      if (now < 1 || spinSegmentAt(track.spin, t).kind === 'settle') track.spin = this.#idleSpin(track, t);
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
      // to upright, a spin-up or a brake need every frame.
      if (spinChanging(track.spin, t) && (phase !== 'floating' || id === this.#attended)) moving = true;
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
      track.segments = [
        { ...still(hidden, t, begin), phase: 'stowed' },
        { ...up, phase: 'rising' },
        { ...side, phase: 'rising' },
        { ...enter, phase: 'rising' },
        { ...rest, phase: 'floating' },
      ];
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
      const back = homeInFront(out ? out.at(out.end) : live, track.slot, this.#options.eye(), out?.end ?? t);
      const rest = settle(back.at(back.end), track.slot, back.end);
      track.segments = [
        ...(out ? [{ ...out, phase: 'homing' as const }] : []),
        { ...back, phase: 'homing' },
        { ...rest, phase: 'floating' },
      ];
      track.rest = 'floating';
      track.insert = null;
      track.spin = this.#labelSpin(track, t);
      return;
    }
    // On the spindle, or committed to the drop: it lands, brakes, stands up and goes home behind the shelf.
    const insert = track.insert;
    const dropping = phase === 'dropping' && insert !== null;
    const landed = dropping ? insert.contact + pick.bounceMs : t;
    const standAt = Math.max(landed, t + swap.brakeMs);
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
    // A disc already dropping lands before it leaves: its contact still sounds.
    if (dropping && insert.contact > t) {
      this.#addMoment({ at: insert.contact, owner: track.id, cue: 'disc-seat', disc: track.id });
    }
    const stand = standUp(standAt);
    const exitZ = exitPlane([...this.#discs.values()].map((disc) => disc.slot));
    const back = backToExit(stand.at(stand.end), exitZ, stand.end);
    const side = across(back.at(back.end), track.slot.position, back.end, swap.acrossMs);
    const home = into(side.at(side.end), track.slot, side.end, swap.intoMs, false);
    const rest = settle(home.at(home.end), track.slot, home.end);
    track.segments = [
      ...kept,
      { ...still(seatPose(), dropping ? landed : t, standAt), phase: 'seated' },
      { ...stand, phase: 'unseating' },
      { ...back, phase: 'exiting' },
      { ...side, phase: 'exiting' },
      { ...home, phase: 'exiting' },
      { ...rest, phase: 'floating' },
    ];
    track.rest = 'floating';
    track.insert = null;
    this.#addMoment({ at: standAt, owner: track.id, cue: 'disc-unseat', disc: track.id });
    track.spin = [...track.spin, this.#uprightFrom(track.spin, back.start, UPRIGHT_SPRING)];
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
    const way: PhasedSegment[] = [];
    let rising = 0;
    for (const segment of track.segments) {
      if (segment.phase === 'rising') rising++;
      if (rising > 2) break;
      if (segment.end > t) way.push(segment);
    }
    return way;
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

  /** The spin winding down to the nearest label-upright angle (attention, homing). */
  #labelSpin(track: DiscTrack, t: number): SpinTrack {
    return [this.#uprightFrom(track.spin, t, UPRIGHT_SPRING)];
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
    return [...kept, this.#uprightFrom(kept, at, REST_SPIN_SPRING)];
  }

  #restStartAfter(t: number): number {
    const rest = this.#amplitude.find((entry) => entry.a1 === 0 && entry.from >= t);
    return rest?.from ?? t;
  }

  /** The slot moved: a disc at rest glides over now, a disc on its way there once it has arrived. */
  #relaySlot(track: DiscTrack, t: number): void {
    if (track.rest !== 'floating') return;
    const goal = slotPose(track.slot);
    const last = track.segments.at(-1);
    if (last && last.end > t) {
      // Its planned move ends where the old slot was: from there, on to the new one.
      if (last.phase === 'floating' || last.phase === 'rising') {
        const end = last.at(last.end);
        goal.orientation.copy(slotFacing(track.slot, labelAway(end.orientation)));
        track.segments.push({ ...ease(end, goal, last.end, DISC_MOTION.relayoutMs), phase: last.phase });
      }
      return;
    }
    if (this.#phaseAt(track, t) !== 'floating') return;
    const move = ease(this.#poseAt(track, t), goal, t, DISC_MOTION.relayoutMs);
    track.segments = [{ ...move, phase: 'floating' }];
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

function spinSegmentAt(track: SpinTrack, t: number): SpinSegment {
  let current = track[0];
  for (const segment of track) if (segment.t0 <= t) current = segment;
  if (!current) throw new Error('A spin track needs a segment');
  return current;
}
