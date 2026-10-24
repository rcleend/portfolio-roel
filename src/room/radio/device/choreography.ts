import { Quaternion, Vector3 } from 'three';
import { clamp01 } from '../../motion/easing';
import type { DiscSlot } from '../discLayout';
import type { RadioCue, RadioKey, Transport } from '../RadioDeck';
import { DECK } from './deckLayout';
import {
  anticipate,
  apexPose,
  approachPoint,
  attentionPose,
  centreOutOrder,
  DISC_MOTION,
  type DiscPose,
  drop,
  ease,
  flight,
  flyHome,
  glide,
  hiddenPose,
  IDLE,
  type IdleCharacter,
  idleCharacter,
  idleOffset,
  type PoseSegment,
  returnHome,
  rise,
  riseStagger,
  seatPose,
  settle,
  slotPose,
  still,
  unseat,
} from './discMotion';
import { type KeyPress, keyMoving, keyTravel, releaseStart } from './keyMotion';
import { closeFrom, LID_DISC_GATE_DEGREES, type LidPlan, lidAt, lidMoments, lidReaches, openFrom } from './lidMotion';
import { type SpinSegment, type SpinTrack, Spring, spinAt, spinChanging, spinThen, uprightTarget } from './springs';

/**
 * The CD player's storyboard as data (docs/ROOM.md › The CD player): events in (the approach, the landing, the
 * leave, the app's deck state, attention, key presses) and, at any time `t`, the pose of every part plus the
 * mechanical moments that happened since the last `advance`. Every part is a pure function of time between events;
 * an event retargets from the parts' live poses, so the latest request always wins and nothing ever jumps.
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
  | 'unseating'
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

/** Labels that have not arrived this long after the landing rise as plain silver discs. */
export const LABEL_WAIT_MS = 3000;
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
const PATH_LEAN_BACK = 0.03;
/** The disc hanging above the seat lifts this much while another drops beneath it. */
const SEAT_CLEARANCE_LIFT = 0.025;
/** The leaning discs come back over this long once the flight has passed. */
const LEAN_RELEASE_MS = 250;
const SYMPATHY_DIP = 0.0015;
const SYMPATHY_MS = 160;
/** The radio's top: a disc below it is inside the radio. */
const RADIO_TOP = 1.087;
/** Under reduced motion ▷II is drawn pressed this long on a pick. */
const REDUCED_PRESS_MS = 120;
/** Spin-up durations: after an insert, from paused (sound first), from stopped. */
const SPIN_UP_MS = { insert: 900, paused: 350, stopped: 600 } as const;
/** Spin-down durations: pause, stop (a brake). */
const SPIN_DOWN_MS = { paused: 700, stopped: 1100 } as const;
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
  #labelsReady = false;
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

  /** The viewport or insets changed: resting discs glide to their new slots. */
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

  /** Every label has arrived: nothing holds the rise back. */
  setLabelsReady(ready: boolean, t: number): void {
    if (ready === this.#labelsReady) return;
    this.#labelsReady = ready;
    if (ready && this.#presence === 'present' && !this.#riseScheduled) this.#scheduleRise(t);
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
    // Turning back mid-leave: discs still above the radio glide back to their slots.
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded || this.#phaseAt(track, t) !== 'returning') continue;
      const live = this.#poseAt(track, t);
      if (live.position.y < RADIO_TOP) continue;
      this.#cancel(track.id, t);
      const back = ease(live, slotPose(track.slot), t, DISC_MOTION.relayoutMs, 0.02);
      track.segments = [{ ...back, phase: 'rising' }];
      track.rest = 'floating';
      track.spin = this.#labelSpin(track, t);
    }
  }

  /** The camera landed at the radio. */
  reveal(t: number): void {
    if (this.#presence !== 'approaching') return;
    this.#presence = 'present';
    this.#revealedAt = t;
    if (this.#options.reducedMotion()) {
      this.#riseScheduled = true;
      return;
    }
    if (this.#labelsReady) this.#scheduleRise(t);
  }

  /** The camera is asked to leave: discs go home edge-in, an insert under way lands, then the lid closes. */
  conceal(t: number): void {
    if (!this.atRadio) return;
    this.#presence = 'leaving';
    this.attend(null, t);
    if (this.#options.reducedMotion()) {
      const cut = t + this.#options.reducedFadeMs;
      if (this.lidDegrees(t) > 0) this.#addMoment({ at: cut, owner: 'lid', cue: 'lid-latch', part: 'lid' });
      this.#setLid(t, { kind: 'closed' }, cut);
      for (const track of this.#discs.values()) {
        if (track.id === this.#loaded) continue;
        this.#cancel(track.id, t);
        track.segments = [{ ...still(this.#poseAt(track, t), t, cut), phase: this.#phaseAt(track, t) }];
        track.rest = 'stowed';
      }
      return;
    }
    let closeAt = t;
    // The insert the visitor asked for finishes: it lands within 200 ms and its seated moment still fires.
    const loaded = this.#loaded === null ? undefined : this.#discs.get(this.#loaded);
    if (loaded) {
      const phase = this.#phaseAt(loaded, t);
      if (phase === 'inserting') closeAt = this.#commitInsert(loaded, t);
      else if (phase === 'dropping' && loaded.insert) closeAt = loaded.insert.contact + DISC_MOTION.pick.bounceMs;
    }
    const visible: DiscTrack[] = [];
    for (const track of this.#discs.values()) {
      if (track.id === this.#loaded) continue;
      if (this.#phaseAt(track, t) === 'stowed') {
        // Still inside the radio (a rise that had not started): it stays there.
        this.#cancel(track.id, t);
        track.segments = [];
        track.rest = 'stowed';
      } else {
        visible.push(track);
      }
    }
    // Edge-in: the outermost first, the middle last.
    const edgeIn = centreOutOrder(this.#order.length).reverse();
    visible.sort((a, b) => edgeIn.indexOf(a.index) - edgeIn.indexOf(b.index));
    visible.forEach((track, k) => {
      const start = t + DISC_MOTION.leave.stagger * k;
      const live = this.#poseAt(track, t);
      this.#cancel(track.id, t);
      const home = returnHome(live, apexPose(track.slot, 0), start);
      track.segments = [
        { ...still(live, t, start), phase: 'returning' },
        { ...home, phase: 'returning' },
      ];
      track.rest = 'stowed';
      track.insert = null;
      track.spin = this.#decaySpin(track, t, 0);
      this.#addMoment({ at: start, owner: track.id, cue: 'disc-sink', order: k, disc: track.id });
      closeAt = Math.max(closeAt, home.end);
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
    const clearAt = previous ? this.#leaveSeat(previous, t, incoming, instant) : t;
    if (!incoming) return;
    this.#cancel(incoming.id, t);
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
    const { pick, swap } = DISC_MOTION;
    const eye = this.#options.eye();
    const live = this.#poseAt(incoming, t);
    const antic = anticipate(live, eye, t);
    // A disc still leaving the seat makes this one wait beside it, 30 mm towards its own side.
    const waits = clearAt > antic.end + pick.flightMs;
    const side = waits ? Math.sign(incoming.slot.position.x - DECK.seat.x || 1) * swap.sideOffset : 0;
    const above = approachPoint(side);
    const fly = flight(antic.at(antic.end), above, eye, antic.end, pick.flightMs);
    const dropStart = waits ? Math.max(fly.end, t + swap.earliestDrop, clearAt) : fly.end;
    const fall = drop(above, dropStart);
    const contact = dropStart + pick.dropMs;
    const bottom = contact + pick.pressBottomAfter;
    incoming.segments = [
      { ...antic, phase: 'inserting' },
      { ...fly, phase: 'inserting' },
      { ...still(fly.at(fly.end), fly.end, dropStart), phase: 'inserting' },
      { ...fall, phase: 'dropping' },
    ];
    incoming.rest = 'seated';
    incoming.insert = { dropStart, contact, bottom };
    // The label winds to upright in flight and lies still on the spindle until ▷II goes down.
    incoming.spin = [this.#uprightFrom(incoming.spin, antic.end, UPRIGHT_SPRING)];
    this.#addMoment({ at: t, owner: incoming.id, cue: 'disc-pick', disc: incoming.id });
    this.#addMoment({ at: contact, owner: incoming.id, cue: 'disc-seat', disc: incoming.id });
    // Discs on its path lean back out of its way; at contact the shelf dips in sympathy.
    this.#leanAside(incoming, t, fly.end);
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
    // The radio presses its own ▷II: from the ghost press to the bottom, where the sound starts.
    this.press('play-pause', contact + pick.ghostPressAfter, bottom, {
      owner: incoming.id,
      minHold: pick.pressBottomAfter - pick.ghostPressAfter,
    });
    this.#addMoment({ at: bottom, owner: incoming.id, seated: true, disc: incoming.id });
    if (this.#transport === 'playing') this.#spinUp(incoming, bottom, SPIN_UP_MS.insert);
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
   * either replaces the last.
   */
  press(
    key: RadioKey,
    t: number,
    up: number | null,
    options: { readonly instant?: boolean; readonly minHold?: number; readonly owner?: string } = {},
  ): void {
    const press: KeyPress = { key, down: t, up, instant: options.instant, minHold: options.minHold };
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

  /** Fires every moment in (last advance, t] in time order; starts the rise once the label wait is over. */
  advance(t: number): Moment[] {
    if (this.#presence === 'present' && !this.#riseScheduled && this.#revealedAt !== null) {
      if (t - this.#revealedAt >= LABEL_WAIT_MS) this.#scheduleRise(t);
    }
    // Every moment is fired once and dropped: one decided at the very time of the last frame still fires.
    const due = this.#moments.filter((moment) => moment.at <= t);
    this.#moments = this.#moments.filter((moment) => moment.at > t);
    for (const track of this.#discs.values()) {
      if (track.insert && t >= track.insert.bottom) track.insert = null;
      track.bumps = track.bumps.filter((bump) => t < bump.start + bump.duration);
    }
    return due.sort((a, b) => a.at - b.at);
  }

  sample(t: number): ChoreographySample {
    const lid = lidAt(this.#lidPlanAt(t), t);
    const amplitude = this.#amplitudeAt(t);
    const eye = this.#options.eye();
    const discs: DiscSample[] = [];
    let moving = lid.moving || this.#lidPlans.some((entry) => entry.from > t);
    let ambient = this.#amplitude.some((entry) => t >= entry.from && t < entry.from + entry.duration);
    for (const id of this.#order) {
      const track = this.#discs.get(id);
      if (!track) continue;
      const segment = activeSegment(track.segments, t);
      const phase = segment?.phase ?? track.rest;
      const base = segment ? segment.at(t) : this.#poseAt(track, t);
      const spin = spinAt(track.spin, t);
      if (track.segments.some((segment) => segment.end > t)) moving = true;
      if (track.insert) moving = true;
      const position = base.position.clone();
      let orientation = base.orientation.clone();
      let scale = base.scale;
      if (phase === 'floating') {
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
        if ([track.attention, track.lean, track.tiltX, track.tiltY].some((spring) => !spring.settled(t, 1e-3))) {
          moving = true;
        }
        if (amplitude > 0) ambient = true;
      }
      for (const bump of track.bumps) {
        if (t <= bump.start || t >= bump.start + bump.duration) continue;
        position.addScaledVector(bump.offset, bumpWeight(bump, t));
        moving = true;
      }
      // A floating disc's idle spin (and its settling when the float rests) is ambient; the attended disc winding
      // to upright, a spin-up or a brake need every frame.
      if (spinChanging(track.spin, t) && (phase !== 'floating' || id === this.#attended)) moving = true;
      orientation.multiply(new Quaternion().setFromAxisAngle(Z, spin.phi));
      discs.push({ id, phase, position, orientation, scale, omega: spin.omega, visible: phase !== 'stowed' });
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
      attention: new Spring(0, ATTENTION_SPRING.zeta, ATTENTION_SPRING.hz),
      lean: new Spring(0, LEAN_SPRING.zeta, LEAN_SPRING.hz),
      tiltX: new Spring(0, TILT_SPRING.zeta, TILT_SPRING.hz),
      tiltY: new Spring(0, TILT_SPRING.zeta, TILT_SPRING.hz),
      bumps: [],
    };
  }

  /** Discs inside the radio rise centre-out, staggered, once the camera has landed and the lid has passed 80°. */
  #scheduleRise(t: number): void {
    this.#riseScheduled = true;
    const gate = lidReaches(this.#lidPlanAt(t), LID_DISC_GATE_DEGREES, t) ?? t;
    const start = Math.max(t, this.#revealedAt ?? t, gate);
    const warm = this.#arrivals > 1 || this.#options.slow();
    const { rise: r, glide: g } = DISC_MOTION;
    const riseMs = warm ? r.warmMs : r.ms;
    const glideMs = warm ? g.warmMs : g.ms;
    const waiting = centreOutOrder(this.#order.length)
      .map((index) => this.#discs.get(this.#order[index] ?? ''))
      .filter((track): track is DiscTrack => track !== undefined && track.id !== this.#loaded)
      .filter((track) => this.#phaseAt(track, t) === 'stowed' && !track.segments.some((segment) => segment.end > t));
    const stagger = riseStagger(waiting.length, warm);
    const restAt = this.#restStartAfter(t);
    waiting.forEach((track, k) => {
      const begin = start + stagger * k;
      const hidden = hiddenPose();
      const apex = apexPose(track.slot, k);
      const up = rise(hidden, apex, begin, riseMs);
      const across = glide(apex, track.slot, up.end, glideMs);
      const rest = settle(across.at(across.end), track.slot, across.end);
      this.#cancel(track.id, t);
      track.segments = [
        { ...still(hidden, t, begin), phase: 'stowed' },
        { ...up, phase: 'rising' },
        { ...across, phase: 'rising' },
        { ...rest, phase: 'floating' },
      ];
      track.rest = 'floating';
      // Spinning on the way up; over the glide the spin decays to the idle rate.
      const idle = this.#calm() ? 0 : track.character.spin;
      const rising: SpinSegment = { kind: 'coast', t0: begin, phi0: 0, omega: DISC_MOTION.riseSpin };
      const atApex = spinAt([rising], up.end);
      const spin: SpinTrack = [
        { kind: 'coast', t0: t, phi0: 0, omega: 0 },
        rising,
        {
          kind: 'decay',
          t0: up.end,
          phi0: atApex.phi,
          omega0: atApex.omega,
          omega1: idle,
          tau: DISC_MOTION.glideSpinTau,
        },
      ];
      track.spin = this.#restSpin(spin, t, Math.max(rest.end, restAt));
      this.#addMoment({ at: begin, owner: track.id, cue: 'disc-rise', order: k, disc: track.id });
      const edgeOn = across.start + glideMs * ((g.flipFrom + g.flipTo) / 2);
      this.#addMoment({ at: edgeOn, owner: track.id, cue: 'disc-flip', order: k, disc: track.id });
    });
  }

  /** A disc called away from the seat (another was picked, or the player emptied). Returns when it is clear. */
  #leaveSeat(track: DiscTrack, t: number, incoming: DiscTrack | undefined, instant: boolean): number {
    const phase = this.#phaseAt(track, t);
    this.#cancel(track.id, t);
    if (instant) {
      track.segments = [];
      track.rest = this.atRadio ? 'floating' : 'stowed';
      track.insert = null;
      track.spin = [{ kind: 'coast', t0: t, phi0: 0, omega: 0 }];
      return t;
    }
    const { swap, pick } = DISC_MOTION;
    if (phase === 'inserting') {
      // Not committed to the drop yet: straight back home from where it is.
      const back = ease(this.#poseAt(track, t), slotPose(track.slot), t, swap.homeMs, 0.03);
      track.segments = [{ ...back, phase: 'homing' }];
      track.rest = 'floating';
      track.insert = null;
      track.spin = this.#labelSpin(track, t);
      return this.#clearTime(track, t);
    }
    // On the spindle, or committed to the drop: it lands, brakes, then pops off and flies home.
    const landed = phase === 'dropping' && track.insert ? track.insert.contact + pick.bounceMs : t;
    const unseatAt = Math.max(landed, t + swap.brakeMs);
    const live = spinAt(track.spin, t);
    if (Math.abs(live.omega) > 0.5) {
      this.#addMoment({ at: t, owner: track.id, cue: 'spin-down', disc: track.id });
      track.spin = [
        {
          kind: 'ramp',
          t0: t,
          phi0: live.phi,
          omega0: live.omega,
          omega1: 0,
          duration: swap.brakeMs,
          ease: 'out-cubic',
        },
      ];
    }
    const kept = phase === 'dropping' ? track.segments.filter((segment) => segment.end > t) : [];
    // A disc already dropping lands before it leaves: its contact still sounds.
    if (phase === 'dropping' && track.insert && track.insert.contact > t) {
      this.#addMoment({ at: track.insert.contact, owner: track.id, cue: 'disc-seat', disc: track.id });
    }
    const seated = seatPose();
    const pop = unseat(seated, unseatAt);
    const higher =
      incoming !== undefined &&
      Math.sign(incoming.slot.position.x - DECK.seat.x) === Math.sign(track.slot.position.x - DECK.seat.x);
    const home = flyHome(pop.at(pop.end), track.slot, this.#options.eye(), pop.end, higher);
    const rest = settle(home.at(home.end), track.slot, home.end);
    track.segments = [
      ...kept,
      { ...still(seated, kept.length > 0 ? landed : t, unseatAt), phase: 'seated' },
      { ...pop, phase: 'unseating' },
      { ...home, phase: 'homing' },
      { ...rest, phase: 'floating' },
    ];
    track.rest = 'floating';
    track.insert = null;
    this.#addMoment({ at: unseatAt, owner: track.id, cue: 'disc-unseat', disc: track.id });
    track.spin = [...track.spin, this.#uprightFrom(track.spin, home.start, UPRIGHT_SPRING)];
    return this.#clearTime(track, t);
  }

  /** The first moment a disc leaving the seat is 60 mm clear of it (sampled every 10 ms). */
  #clearTime(track: DiscTrack, t: number): number {
    const seat = DECK.seat;
    const end = Math.max(t, ...track.segments.map((segment) => segment.end));
    for (let at = t; at <= end; at += 10) {
      if (this.#poseAt(track, at).position.distanceTo(seat) >= DISC_MOTION.swap.clearance) return at;
    }
    return end;
  }

  /** Leaving mid-insert: the disc lands within 150 ms from where it is. Returns when it is down. */
  #commitInsert(track: DiscTrack, t: number): number {
    const { leave, pick } = DISC_MOTION;
    this.#cancel(track.id, t);
    const land = ease(this.#poseAt(track, t), seatPose(), t, leave.commitMs);
    track.segments = [{ ...land, phase: 'dropping' }];
    track.rest = 'seated';
    track.insert = { dropStart: t, contact: land.end, bottom: land.end };
    track.spin = [{ kind: 'coast', t0: t, phi0: spinAt(track.spin, t).phi, omega: 0 }];
    this.#addMoment({ at: land.end, owner: track.id, cue: 'disc-seat', disc: track.id });
    this.#addMoment({ at: land.end, owner: track.id, seated: true, disc: track.id });
    if (this.#transport === 'playing') this.#spinUp(track, land.end, SPIN_UP_MS.insert);
    return land.end + pick.bounceMs;
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

  #relaySlot(track: DiscTrack, t: number): void {
    if (this.#phaseAt(track, t) !== 'floating' || track.segments.some((segment) => segment.end > t)) return;
    const move = ease(this.#poseAt(track, t), slotPose(track.slot), t, DISC_MOTION.relayoutMs);
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

  /**
   * Discs between a picked disc and the seat lean back 30 mm, away from the camera, from the pick until the flight
   * has passed in front of them, so it clears them with room to spare.
   */
  #leanAside(incoming: DiscTrack, t: number, flightEnd: number): void {
    const lo = Math.min(incoming.slot.position.x, DECK.seat.x) - 0.07;
    const hi = Math.max(incoming.slot.position.x, DECK.seat.x) + 0.07;
    const eye = this.#options.eye();
    for (const track of this.#discs.values()) {
      if (track === incoming || !this.#isFloating(track.id, t)) continue;
      const x = track.slot.position.x;
      if (x < lo || x > hi) continue;
      // Straight away from the camera, so the flight passes a full 30 mm nearer than before; the disc right above
      // the seat also lifts, so the one dropping beneath it into the well stays in view.
      const offset = track.slot.position.clone().sub(eye).setY(0).normalize().multiplyScalar(PATH_LEAN_BACK);
      if (Math.abs(x - DECK.seat.x) < 0.07) offset.y += SEAT_CLEARANCE_LIFT;
      track.bumps.push({
        start: t,
        duration: flightEnd + DISC_MOTION.pick.dropMs + LEAN_RELEASE_MS - t,
        offset,
        attack: DISC_MOTION.pick.anticipationMs + 30,
        release: LEAN_RELEASE_MS,
      });
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

function spinSegmentAt(track: SpinTrack, t: number): SpinSegment {
  let current = track[0];
  for (const segment of track) if (segment.t0 <= t) current = segment;
  if (!current) throw new Error('A spin track needs a segment');
  return current;
}
