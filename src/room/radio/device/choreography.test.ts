import type { Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { discSlots } from '../discLayout';
import { RADIO_FIXTURE } from '../radioFixtures';
import { radioViewpoint, slotOrientation } from '../radioFraming';
import { Choreography, discHeirs, type Moment } from './choreography';
import { DECK } from './deckLayout';
import { DISC_MOTION } from './discMotion';
import { BLUR_FROM } from './discShader';

const SLOTS = discSlots(5, 1.6);
const EYE = radioViewpoint(
  RADIO_FIXTURE,
  SLOTS,
  { width: 1440, height: 900 },
  { top: 0, right: 0, bottom: 0, left: 0 },
).position;
const IDS = ['a', 'b', 'c', 'd', 'e'];
/** The camera lands this long after the click. */
const LANDING = 1100;
const FRAME = 16;
const { pick } = DISC_MOTION;
/** A pick's contact and ▷II's press bottom (the sound), after the pick. */
const CONTACT = pick.anticipationMs + pick.flightMs + pick.slideMs - pick.dropLeadMs + pick.dropMs;
const BOTTOM = CONTACT + pick.pressAfter + pick.pressDownMs;

function setup(reduced = false, slow = false) {
  const choreography = new Choreography({
    reducedFadeMs: 140,
    eye: () => EYE,
    reducedMotion: () => reduced,
    slow: () => slow,
  });
  choreography.setDiscs(IDS, SLOTS, 0);
  const fired: Moment[] = [];
  let now = 0;
  /** Runs frames until `t`, firing moments as a device would. */
  const run = (t: number) => {
    for (; now < t; now = Math.min(t, now + FRAME)) fired.push(...choreography.advance(now));
    fired.push(...choreography.advance(t));
    now = t;
  };
  return { choreography, fired, run, at: () => now };
}

/** Arrives at the radio (click at 0, landing at 1100) and waits until every disc floats. */
function arrive(reduced = false) {
  const context = setup(reduced);
  context.choreography.approach(0, 0);
  context.run(reduced ? 280 : LANDING);
  context.choreography.reveal(context.at());
  context.run(reduced ? 300 : 2600);
  return context;
}

const cues = (fired: readonly Moment[], cue: string) => fired.filter((moment) => moment.cue === cue);
const disc = (choreography: Choreography, t: number, id: string) =>
  choreography.sample(t).discs.find((entry) => entry.id === id);

describe('the arrival', () => {
  it('opens the lid on the storyboard: push, pop, swing, peak', () => {
    const { choreography, fired, run } = setup();
    choreography.approach(0, 0);
    run(2000);
    expect(choreography.lidDegrees(700)).toBeCloseTo(0, 6);
    expect(choreography.lidDegrees(840)).toBeCloseTo(5, 6);
    expect(choreography.lidDegrees(1079)).toBeCloseTo(72, 0);
    expect(choreography.lidDegrees(1309)).toBeCloseTo(87.2, 0);
    expect(Math.abs(choreography.lidDegrees(2000) - 84)).toBeLessThan(0.3);
    expect(cues(fired, 'lid-push').map((moment) => moment.at)).toEqual([700]);
    expect(cues(fired, 'lid-unlatch').map((moment) => moment.at)).toEqual([780]);
    expect(cues(fired, 'lid-swing').map((moment) => moment.at)).toEqual([840]);
    expect(cues(fired, 'lid-stop')).toHaveLength(1);
    expect(cues(fired, 'lid-stop')[0]?.at).toBeCloseTo(1309, -1);
  });

  it('raises the discs furthest slot first, left and right by turns, once landed and the lid is past 80°', () => {
    const { choreography, fired } = arrive();
    const rises = cues(fired, 'disc-rise');
    expect(rises.map((moment) => moment.order)).toEqual([0, 1, 2, 3, 4]);
    // e and a hang at the ends, d and b beside the middle, c in the middle.
    expect(rises.map((moment) => moment.disc)).toEqual(['e', 'a', 'd', 'b', 'c']);
    expect(rises[0]?.at).toBeGreaterThanOrEqual(1130);
    expect(rises[0]?.at).toBeLessThanOrEqual(1145);
    expect((rises[1]?.at ?? 0) - (rises[0]?.at ?? 0)).toBeCloseTo(60, 6);
    expect(choreography.lidDegrees(rises[0]?.at ?? 0)).toBeGreaterThanOrEqual(79.99);
    // Each turns over once, in front of its own slot.
    expect(cues(fired, 'disc-flip').map((moment) => moment.disc)).toEqual(['e', 'a', 'd', 'b', 'c']);
  });

  it('rises whether or not the prints are there, and has the shelf up 1.4 s after the landing', () => {
    const { choreography, run, at } = setup();
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(at());
    let up: number | null = null;
    for (let t = LANDING; t < 4000 && up === null; t += 4) {
      run(t);
      if (choreography.discsOut(t)) up = t;
    }
    expect(up).not.toBeNull();
    expect((up ?? 0) - LANDING).toBeLessThanOrEqual(1400);
    const sample = choreography.sample(up ?? 0);
    expect(sample.discs.every((entry) => entry.phase === 'floating')).toBe(true);
    expect(sample.discs.every((entry) => Number.isFinite(entry.position.x))).toBe(true);
    // Not before: the radio's hint waits for it.
    expect(choreography.discsOut((up ?? 0) - 50)).toBe(false);
  });

  it('comes to rest: no frames once the float has rested and the labels stand upright', () => {
    const { choreography } = arrive();
    expect(choreography.sample(3000).ambient).toBe(true);
    expect(choreography.sample(3000).moving).toBe(false);
    const late = choreography.sample(12_000);
    expect(late.ambient).toBe(false);
    expect(late.moving).toBe(false);
    expect(choreography.ambientAt(12_000)).toBe(false);
  });

  it('brings a disc still on its way up out and over to its column, then flies it on from there', () => {
    const { choreography, fired, run, at } = setup();
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(at());
    run(1300);
    // c rises last: it is still inside the radio.
    expect(disc(choreography, 1300, 'c')?.phase).toBe('stowed');
    choreography.setLoaded('c', 1300, true);
    run(4000);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => moment.disc)).toEqual(['c']);
    const rise = cues(fired, 'disc-rise').find((moment) => moment.disc === 'c');
    expect(rise).toBeDefined();
    // Up and across, then (once its way to the seat is clear of the discs still turning into their slots in the
    // lanes in front) the flight with no wind-up (it is already moving), and never the turn into its slot.
    const { rise: up, across } = DISC_MOTION;
    const waited = (seated[0]?.at ?? 0) - (rise?.at ?? 0) - (up.ms + across.ms + BOTTOM - pick.anticipationMs);
    expect(waited).toBeGreaterThanOrEqual(-1e-6);
    expect(waited).toBeLessThan(400);
    expect(cues(fired, 'disc-flip').map((moment) => moment.disc)).not.toContain('c');
    expect(choreography.sample(4000).discs.filter((entry) => entry.phase === 'floating')).toHaveLength(4);
  });
});

describe('a pick on the way up, then another', () => {
  it('sends the first on into its slot from where it is, without a jump', () => {
    const { choreography, fired, run, at } = setup();
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(at());
    choreography.setTransport('playing', at());
    choreography.setLoaded('a', at(), true);
    run(1220);
    choreography.setLoaded('b', 1220, true);
    let last = disc(choreography, 1220, 'a')?.position.clone();
    for (let t = 1228; t <= 4000; t += 8) {
      run(t);
      const now = disc(choreography, t, 'a');
      if (now?.visible && last) expect(now.position.distanceTo(last)).toBeLessThan(0.04);
      last = now?.visible ? now.position.clone() : undefined;
    }
    expect(disc(choreography, 4000, 'a')?.phase).toBe('floating');
    expect(disc(choreography, 4000, 'b')?.phase).toBe('seated');
    // It turned over into its slot after all.
    expect(cues(fired, 'disc-flip').map((moment) => moment.disc)).toContain('a');
    expect(fired.filter((moment) => moment.seated).map((moment) => moment.disc)).toEqual(['b']);
  });
});

describe('the slow tier', () => {
  it('draws frames until every disc has come to rest label-upright, then none', () => {
    const { choreography, run, at } = setup(false, true);
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(at());
    run(2000);
    // Still settling: the label is not upright yet, and no ambient frame would ever bring it there.
    expect(choreography.sample(2000).moving).toBe(true);
    let restAt: number | null = null;
    for (let t = 2000; t <= 8000 && restAt === null; t += 16) {
      run(t);
      if (!choreography.sample(t).moving) restAt = t;
    }
    expect(restAt).not.toBeNull();
    const rest = choreography.sample(restAt ?? 0);
    expect(rest.ambient).toBe(false);
    rest.discs.forEach((entry, index) => {
      const slot = SLOTS[index];
      if (!slot) throw new Error('slot');
      expect(entry.orientation.angleTo(slotOrientation(slot))).toBeLessThan(0.005);
    });
  });
});

describe('a pick', () => {
  it('inserts the disc from its live pose, presses ▷II as a beat of its own and starts it spinning', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(5000);
    expect(cues(fired, 'disc-pick').map((moment) => moment.at)).toEqual([3000]);
    expect(cues(fired, 'disc-seat').map((moment) => moment.at)).toEqual([3000 + CONTACT]);
    // Down once the bounce is over, slowly, to the bottom (the sound), held, up.
    expect(cues(fired, 'key-down').map((moment) => moment.at)).toEqual([3000 + CONTACT + pick.pressAfter]);
    expect(cues(fired, 'key-up').map((moment) => moment.at)).toEqual([3000 + BOTTOM + pick.pressHoldMs]);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => [moment.at, moment.disc])).toEqual([[3000 + BOTTOM, 'a']]);
    expect(BOTTOM).toBe(900);
    expect(cues(fired, 'spin-up').map((moment) => moment.at)).toEqual([3000 + BOTTOM]);
    const seatedDisc = disc(choreography, 5000, 'a');
    expect(seatedDisc?.phase).toBe('seated');
    expect(seatedDisc?.position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
    expect(seatedDisc?.omega).toBeCloseTo(DISC_MOTION.playSpeed, 6);
    // At play speed the disc is its radial average: it needs no frames.
    expect(choreography.sample(6000).moving).toBe(false);
  });

  it('holds ▷II down 150 ms at the bottom of the press, where the old one barely touched it', () => {
    const { choreography, run } = arrive();
    choreography.setLoaded('a', 3000, true);
    run(3000 + BOTTOM + 100);
    const held = choreography.sample(3000 + BOTTOM + 100).keys;
    expect(held.rockerKey).toBe('play-pause');
    expect(held.rockerTravel).toBeCloseTo(1, 6);
  });

  it('swaps: the playing disc brakes, stands up and goes home behind the shelf while the new one comes in front', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(5500);
    choreography.setLoaded('e', 5500, true);
    run(8000);
    expect(cues(fired, 'spin-down').map((moment) => moment.at)).toEqual([5500]);
    expect(cues(fired, 'disc-unseat').map((moment) => moment.at)).toEqual([5500 + DISC_MOTION.swap.brakeMs]);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => moment.disc)).toEqual(['a', 'e']);
    const second = seated[1]?.at ?? 0;
    // The new one slides over the seat only once the old one is clear of the well.
    expect(second - 5500).toBeGreaterThanOrEqual(1000);
    expect(second - 5500).toBeLessThanOrEqual(1250);
    expect(disc(choreography, 6100, 'a')?.phase).toBe('exiting');
    // Behind the shelf: the exit plane is behind every slot.
    expect(disc(choreography, 6100, 'a')?.position.z).toBeLessThan(-2.07);
    expect(disc(choreography, 8000, 'a')?.phase).toBe('floating');
    expect(disc(choreography, 8000, 'e')?.phase).toBe('seated');
  });

  it('lets the latest pick win: a disc not yet committed to its drop goes home in front and never seats', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(3300);
    choreography.setLoaded('d', 3300, true);
    run(6000);
    expect(fired.filter((moment) => moment.seated).map((moment) => moment.disc)).toEqual(['d']);
    expect(cues(fired, 'disc-seat').map((moment) => moment.disc)).toEqual(['d']);
    expect(disc(choreography, 3400, 'a')?.phase).toBe('homing');
    expect(disc(choreography, 6000, 'a')?.phase).toBe('floating');
  });

  it('keeps the next disc in its slot until a disc called back in front of the shelf is home', () => {
    const { choreography, run } = arrive();
    choreography.setLoaded('a', 3000, true);
    run(3300);
    choreography.setLoaded('d', 3300, true);
    run(3350);
    choreography.setLoaded('b', 3350, true);
    // d had not left its slot: it stays. a is going home in front; b waits for it.
    expect(disc(choreography, 3360, 'd')?.phase).toBe('floating');
    expect(disc(choreography, 3500, 'b')?.phase).toBe('floating');
    run(6000);
    expect(disc(choreography, 6000, 'b')?.phase).toBe('seated');
  });

  it('lets a disc already dropping land first, then sends it home', () => {
    const { choreography, fired, run } = arrive();
    choreography.setLoaded('a', 3000, true);
    run(3700);
    choreography.setLoaded('b', 3700, true);
    run(6500);
    // The dropping disc lands (its seat sounds) but its insert was superseded: only b is seated.
    expect(cues(fired, 'disc-seat').map((moment) => moment.disc)).toEqual(['a', 'b']);
    expect(fired.filter((moment) => moment.seated).map((moment) => moment.disc)).toEqual(['b']);
    expect(cues(fired, 'disc-unseat').map((moment) => moment.disc)).toEqual(['a']);
  });

  it('puts a disc on its way out back onto the spindle when it is chosen again', () => {
    const { choreography, fired, run } = arrive();
    choreography.setLoaded('a', 3000, true);
    run(4500);
    choreography.setLoaded('b', 4500, true);
    run(4800);
    expect(disc(choreography, 4800, 'a')?.phase).toBe('unseating');
    choreography.setLoaded('a', 4800, true);
    run(7000);
    expect(fired.filter((moment) => moment.seated).map((moment) => moment.disc)).toEqual(['a', 'a']);
    expect(disc(choreography, 7000, 'a')?.position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
    expect(disc(choreography, 7000, 'b')?.phase).toBe('floating');
  });

  it('spins down from wherever the spin-up is when paused mid-way, and brakes on a stop', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(4200);
    const spinning = disc(choreography, 4200, 'a')?.omega ?? 0;
    expect(spinning).toBeGreaterThan(0);
    expect(spinning).toBeLessThan(DISC_MOTION.playSpeed);
    choreography.setTransport('paused', 4200);
    run(4201);
    expect(disc(choreography, 4201, 'a')?.omega).toBeCloseTo(spinning, 0);
    run(5000);
    expect(disc(choreography, 5000, 'a')?.omega).toBeCloseTo(0, 6);
    choreography.setTransport('playing', 5000);
    run(5400);
    expect(disc(choreography, 5400, 'a')?.omega).toBeCloseTo(DISC_MOTION.playSpeed, 6);
    choreography.setTransport('stopped', 5400);
    run(6600);
    expect(disc(choreography, 6600, 'a')?.omega).toBeCloseTo(0, 6);
    expect(cues(fired, 'spin-up').map((moment) => moment.at)).toEqual([3000 + BOTTOM, 5000]);
    expect(cues(fired, 'spin-down').map((moment) => moment.at)).toEqual([4200, 5400]);
  });

  it('waits for the bottom of the press if the transport changes while the disc is still flying in', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    choreography.setTransport('paused', 3200);
    run(5000);
    expect(cues(fired, 'spin-up')).toHaveLength(0);
    expect(disc(choreography, 5000, 'a')?.omega).toBeCloseTo(0, 6);
  });
});

describe('the label wind-down', () => {
  /** The fastest |ω| of disc `id` over [from, to], sampled every 4 ms. */
  const fastest = (choreography: Choreography, id: string, from: number, to: number) => {
    let peak = 0;
    for (let t = from; t <= to; t += 4) peak = Math.max(peak, Math.abs(disc(choreography, t, id)?.omega ?? 0));
    return peak;
  };

  it('keeps the print out of the spin blur on a tap, from any angle, and seats the label upright', () => {
    const seated: Quaternion[] = [];
    // The idle spin goes about a turn in six seconds: these taps catch the label at every angle.
    for (let tap = 3000; tap < 9000; tap += 397) {
      const { choreography } = arrive();
      choreography.attend('a', tap);
      choreography.setLoaded('a', tap, true);
      // Half a turn to go and the contact 750 ms away is the hardest case (1.5 · π / 0.75 s, a hair over BLUR_FROM).
      expect(fastest(choreography, 'a', tap, tap + CONTACT)).toBeLessThan(BLUR_FROM * 1.25);
      const landed = disc(choreography, tap + CONTACT, 'a');
      expect(landed?.omega).toBe(0);
      if (landed) seated.push(landed.orientation.clone());
    }
    const [first, ...rest] = seated;
    for (const orientation of rest) expect(orientation.angleTo(first ?? orientation)).toBeLessThan(0.002);
  });

  it('never blurs a hovered label or the resting shelf', () => {
    const { choreography } = arrive();
    choreography.attend('c', 3000);
    choreography.attend(null, 4200);
    for (const id of IDS) expect(fastest(choreography, id, 3000, 4200 + 9000)).toBeLessThanOrEqual(BLUR_FROM + 1e-9);
  });
});

describe('the keys', () => {
  it('press, hold and release with their cues', () => {
    const { choreography, fired, run } = arrive();
    choreography.press('next', 3000, null);
    run(3500);
    expect(choreography.sample(3500).keys.next).toBe(1);
    choreography.release('next', 3500);
    run(3700);
    expect(choreography.sample(3700).keys.next).toBe(0);
    expect(cues(fired, 'key-down').map((moment) => moment.at)).toEqual([3000]);
    expect(cues(fired, 'key-up').map((moment) => moment.at)).toEqual([3500]);
    choreography.press('stop', 4000, 4010);
    run(4030);
    expect(choreography.sample(4030).keys.rockerKey).toBe('stop');
    expect(choreography.sample(4030).keys.rockerTravel).toBeGreaterThan(0.5);
    run(4500);
    expect(cues(fired, 'key-up').at(-1)?.at).toBe(4000 + 140);
  });
});

describe('the leave', () => {
  it('sends the discs home nearest first, one after another down the slot, then closes the lid', () => {
    const { choreography, fired, run } = arrive();
    choreography.conceal(3000);
    run(4600);
    const sinks = cues(fired, 'disc-sink');
    expect(sinks.map((moment) => moment.disc)).toEqual(['c', 'b', 'd', 'a', 'e']);
    // Never two down the slot within its gap of each other.
    const times = sinks.map((moment) => moment.at);
    for (let i = 1; i < times.length; i++) {
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(DISC_MOTION.leave.sinkGap - 1e-9);
    }
    const close = cues(fired, 'lid-close')[0]?.at ?? 0;
    // As the last one starts down the slot; shut and latched (rebound and all) by the time the camera lands.
    expect(close).toBeCloseTo((times.at(-1) ?? 0) + DISC_MOTION.leave.lidAfterSinkMs, 6);
    expect(cues(fired, 'lid-latch')[0]?.at).toBeCloseTo(close + 340, 6);
    expect(close - 3000).toBeLessThanOrEqual(LANDING - 340 - 70 - 30);
    expect(choreography.lidDegrees(3000 + LANDING)).toBe(0);
    expect(choreography.sample(4600).discs.every((entry) => !entry.visible)).toBe(true);
    expect(choreography.sample(4600).moving).toBe(false);
  });

  it('commits an insert under way on a leave: it seats sooner, its seated moment still fires, the shelf goes at once', () => {
    const { choreography, fired, run } = arrive();
    choreography.setLoaded('b', 3000, true);
    run(3100);
    choreography.conceal(3100);
    run(6000);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => moment.disc)).toEqual(['b']);
    expect(seated[0]?.at ?? Number.POSITIVE_INFINITY).toBeLessThan(3000 + BOTTOM);
    // The shelf did not wait for it: the first disc is down the slot before it would have landed as planned.
    expect(cues(fired, 'disc-sink')[0]?.at ?? Number.POSITIVE_INFINITY).toBeLessThan(3000 + CONTACT);
    // And the lid is shut by the time the camera is back in the room (its flight is 1100 ms).
    expect(choreography.lidDegrees(3100 + 1150)).toBe(0);
  });

  it('takes a disc across the back on its way home from the player straight down the slot on a leave', () => {
    const { choreography, fired, run } = arrive();
    choreography.setLoaded('a', 3000, true);
    run(6000);
    choreography.setLoaded('b', 6000, true);
    // Braked, stood up and backed into the plane behind the shelf: across it, on its way to its slot.
    const leave = 6000 + DISC_MOTION.swap.brakeMs + DISC_MOTION.swap.standMs + DISC_MOTION.swap.backMs + 100;
    run(leave);
    expect(choreography.phaseOf('a', leave)).toBe('exiting');
    choreography.conceal(leave);
    const phases = new Set<string>();
    for (let t = leave; t <= leave + 1150; t += FRAME) {
      run(t);
      phases.add(choreography.phaseOf('a', t) ?? 'none');
    }
    // It never went into its slot first, it went down the slot before any disc of the shelf, and the lid is shut.
    expect(phases.has('floating')).toBe(false);
    expect(cues(fired, 'disc-sink').find((moment) => moment.at >= leave)?.disc).toBe('a');
    expect(choreography.lidDegrees(leave + 1150)).toBe(0);
  });

  it('turns back mid-leave: the lid swings open from where it is and every disc retraces its way to its slot', () => {
    const { choreography, run } = arrive();
    choreography.conceal(3000);
    run(3400);
    const lid = choreography.lidDegrees(3400);
    choreography.approach(3400, 3400);
    run(3401);
    expect(Math.abs(choreography.lidDegrees(3401) - lid)).toBeLessThan(1);
    run(4500);
    choreography.reveal(4500);
    run(7000);
    expect(choreography.lidDegrees(7000)).toBeCloseTo(84, 0);
    expect(choreography.sample(7000).discs.every((entry) => entry.phase === 'floating')).toBe(true);
  });
});

describe('a new layout mid-motion', () => {
  it('takes discs still on their way to the slots they now have, without a jump', () => {
    const portrait = discSlots(5, 0.46);
    const steady = arrive();
    const moved = setup();
    moved.choreography.approach(0, 0);
    moved.run(LANDING);
    moved.choreography.reveal(LANDING);
    moved.run(1600);
    moved.choreography.relayout(portrait, 1600);
    const largestStep = (context: ReturnType<typeof setup>, from: number, to: number) => {
      let largest = 0;
      let last = context.choreography.sample(from).discs;
      for (let t = from + FRAME; t <= to; t += FRAME) {
        context.run(t);
        const now = context.choreography.sample(t).discs;
        for (const entry of now) {
          const before = last.find((other) => other.id === entry.id);
          if (before?.visible && entry.visible) largest = Math.max(largest, before.position.distanceTo(entry.position));
        }
        last = now;
      }
      return largest;
    };
    const step = largestStep(moved, 1600, 3400);
    // No more than the arrival's own fastest frame (the rise): the review measured a 330 mm jump here.
    expect(step).toBeLessThan(0.065);
    expect(largestStep(steady, 2600, 3400)).toBeLessThan(0.065);
    const sample = moved.choreography.sample(3400);
    sample.discs.forEach((entry, i) => {
      expect(entry.position.distanceTo(portrait[i]?.position ?? entry.position)).toBeLessThan(0.006);
    });
  });
});

describe('a pick after a new layout', () => {
  it('picked on its way to the slot a turn gave it, a disc glides on there first and never jumps', () => {
    // The keyboard's flow on a phone: Enter as the discs arrive, a turn a moment later, then another disc.
    const turnAt = LANDING + 190;
    let largest = 0;
    for (let second = 1600; second <= 2800; second += 40) {
      const { choreography, run } = setup();
      choreography.approach(0, 0);
      run(LANDING);
      choreography.reveal(LANDING);
      run(LANDING + 50);
      choreography.setLoaded('a', LANDING + 50, true);
      run(turnAt);
      choreography.relayout(discSlots(5, 0.46), turnAt);
      run(second);
      choreography.setLoaded('b', second, true);
      let last = choreography.sample(second).discs;
      for (let t = second + FRAME; t <= second + 3000; t += FRAME) {
        run(t);
        const now = choreography.sample(t).discs;
        for (const entry of now) {
          const before = last.find((other) => other.id === entry.id);
          if (before?.visible && entry.visible) largest = Math.max(largest, before.position.distanceTo(entry.position));
        }
        last = now;
      }
    }
    // No more than the fastest frame of the disc leaving the player (about 68 mm): the review measured jumps of 60
    // to 339 mm here, the picked disc cutting from its old slot to its new one.
    expect(largest).toBeLessThan(0.09);
  });
});

describe('a new collection', () => {
  it('names the discs taking over one that left, index for index, never the loaded one', () => {
    const placeholders = ['disc-1', 'disc-2', 'disc-3'];
    expect([...discHeirs(placeholders, ['x', 'y', 'z'], null)]).toEqual([
      ['x', 'disc-1'],
      ['y', 'disc-2'],
      ['z', 'disc-3'],
    ]);
    // A disc that stays keeps its id; a gone one only passes on to a newcomer at its index.
    expect([...discHeirs(['a', 'b', 'c'], ['a', 'q', 'b'], null)]).toEqual([]);
    expect([...discHeirs(['a', 'b', 'c'], ['a', 'q', 'c', 'r'], null)]).toEqual([['q', 'b']]);
    expect([...discHeirs(['a', 'b'], ['x', 'y'], 'a')]).toEqual([['y', 'b']]);
    expect([...discHeirs([], ['x'], null)]).toEqual([]);
  });

  it('takes the placeholder shelf over in the air: the same discs go on rising, renamed', () => {
    const context = setup();
    const { choreography, fired, run } = context;
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(LANDING);
    run(1500);
    const before = choreography.sample(1500).discs;
    const albums = IDS.map((id) => `album-${id}`);
    choreography.setDiscs(albums, SLOTS, 1500, discHeirs(IDS, albums, null));
    const after = choreography.sample(1500).discs;
    expect(after.map((entry) => entry.id)).toEqual(albums);
    after.forEach((entry, i) => {
      expect(entry.position.distanceTo(before[i]?.position ?? entry.position)).toBeLessThan(1e-9);
      expect(entry.visible).toBe(before[i]?.visible);
    });
    run(3400);
    // No second rise: every flip still due fires under its new name, and the shelf comes to rest.
    expect(cues(fired, 'disc-rise').length).toBe(IDS.length);
    expect(cues(fired, 'disc-flip').every((moment) => moment.disc?.startsWith('album-'))).toBe(true);
    expect(choreography.discsOut(3400)).toBe(true);
  });
});

describe('reduced motion', () => {
  it('cuts to the open lid and the discs in place, and seats a pick in one step', () => {
    const { choreography, fired, run } = arrive(true);
    expect(choreography.lidDegrees(140)).toBe(84);
    const sample = choreography.sample(300);
    expect(sample.discs.every((entry) => entry.phase === 'floating')).toBe(true);
    expect(sample.ambient).toBe(false);
    choreography.setTransport('playing', 400);
    choreography.setLoaded('a', 400, true);
    expect(disc(choreography, 400, 'a')?.phase).toBe('seated');
    // ▷II drawn pressed for 120 ms; the seated disc never spins.
    expect(choreography.sample(450).keys.rockerTravel).toBe(1);
    expect(choreography.sample(530).keys.rockerTravel).toBe(0);
    expect(disc(choreography, 2000, 'a')?.omega).toBe(0);
    // Nothing moves for more than 300 ms after an event.
    expect(choreography.sample(700).moving).toBe(false);
    choreography.conceal(1000);
    run(1200);
    expect(choreography.lidDegrees(1140)).toBe(0);
    expect(choreography.sample(1500).moving).toBe(false);
    // Only changes of state sound, and the leave's latch does.
    const sounded = new Set(fired.map((moment) => moment.cue).filter((cue) => cue !== undefined));
    expect(
      [...sounded].every((cue) => ['lid-unlatch', 'lid-latch', 'disc-seat', 'key-down', 'key-up'].includes(cue ?? '')),
    ).toBe(true);
    expect(cues(fired, 'lid-latch').map((moment) => moment.at)).toEqual([1140]);
  });
});
