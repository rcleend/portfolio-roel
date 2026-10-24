import { describe, expect, it } from 'vitest';
import { discSlots } from '../discLayout';
import { RADIO_FIXTURE } from '../radioFixtures';
import { radioViewpoint } from '../radioFraming';
import { Choreography, type Moment } from './choreography';
import { DECK } from './deckLayout';
import { DISC_MOTION } from './discMotion';

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

function setup(reduced = false) {
  const choreography = new Choreography({
    reducedFadeMs: 140,
    eye: () => EYE,
    reducedMotion: () => reduced,
    slow: () => false,
  });
  choreography.setDiscs(IDS, SLOTS, 0);
  choreography.setLabelsReady(true, 0);
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
  context.run(reduced ? 300 : 2400);
  return context;
}

const cues = (fired: readonly Moment[], cue: string) => fired.filter((moment) => moment.cue === cue);

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

  it('raises the discs centre-out once landed and the lid is past 80°, each cue once, ready by the landing + 1.2 s', () => {
    const { choreography, fired } = arrive();
    const rises = cues(fired, 'disc-rise');
    expect(rises.map((moment) => moment.order)).toEqual([0, 1, 2, 3, 4]);
    expect(rises.map((moment) => moment.disc)).toEqual(['c', 'b', 'd', 'a', 'e']);
    expect(rises[0]?.at).toBeGreaterThanOrEqual(1130);
    expect(rises[0]?.at).toBeLessThanOrEqual(1145);
    expect((rises[1]?.at ?? 0) - (rises[0]?.at ?? 0)).toBeCloseTo(60, 6);
    expect(choreography.lidDegrees(rises[0]?.at ?? 0)).toBeGreaterThanOrEqual(79.99);
    expect(cues(fired, 'disc-flip')).toHaveLength(5);
    const sample = choreography.sample(LANDING + 1200);
    expect(sample.discs.every((disc) => disc.phase === 'floating')).toBe(true);
    expect(sample.discs.every((disc) => Number.isFinite(disc.position.x))).toBe(true);
  });

  it('waits for the labels, then rises plain after 3 s', () => {
    const { choreography, fired, run, at } = setup();
    choreography.setLabelsReady(false, 0);
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(at());
    run(LANDING + 2900);
    expect(cues(fired, 'disc-rise')).toHaveLength(0);
    run(LANDING + 3400);
    expect(cues(fired, 'disc-rise')).toHaveLength(5);
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
});

describe('a pick', () => {
  it('inserts the disc from its live pose, seats it at +890 and starts it spinning', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(5000);
    const pick = cues(fired, 'disc-pick');
    expect(pick.map((moment) => moment.at)).toEqual([3000]);
    expect(cues(fired, 'disc-seat').map((moment) => moment.at)).toEqual([3770]);
    expect(cues(fired, 'key-down').map((moment) => moment.at)).toEqual([3840]);
    expect(cues(fired, 'key-up').map((moment) => moment.at)).toEqual([3890]);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => [moment.at, moment.disc])).toEqual([[3890, 'a']]);
    expect(cues(fired, 'spin-up').map((moment) => moment.at)).toEqual([3890]);
    const disc = choreography.sample(5000).discs.find((entry) => entry.id === 'a');
    expect(disc?.phase).toBe('seated');
    expect(disc?.position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
    expect(disc?.omega).toBeCloseTo(DISC_MOTION.playSpeed, 6);
    // At play speed the disc is its radial average: it needs no frames.
    expect(choreography.sample(6000).moving).toBe(false);
  });

  it('takes a disc still rising straight to the player', () => {
    const { choreography, fired, run, at } = setup();
    choreography.approach(0, 0);
    run(LANDING);
    choreography.reveal(at());
    run(1300);
    expect(choreography.sample(1300).discs.find((disc) => disc.id === 'c')?.phase).toBe('rising');
    choreography.setLoaded('c', 1300, true);
    run(2600);
    expect(fired.filter((moment) => moment.seated).map((moment) => moment.disc)).toEqual(['c']);
    // The others still arrive at their slots.
    expect(choreography.sample(3000).discs.filter((disc) => disc.phase === 'floating')).toHaveLength(4);
  });

  it('swaps: the playing disc brakes, pops off and flies home while the new one waits beside the seat', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(5500);
    choreography.setLoaded('e', 5500, true);
    run(8000);
    expect(cues(fired, 'spin-down').map((moment) => moment.at)).toEqual([5500]);
    expect(cues(fired, 'disc-unseat').map((moment) => moment.at)).toEqual([5800]);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => moment.disc)).toEqual(['a', 'e']);
    const second = seated[1]?.at ?? 0;
    expect(second - 5500).toBeGreaterThanOrEqual(890);
    expect(second - 5500).toBeLessThanOrEqual(1000);
    const sample = choreography.sample(8000);
    expect(sample.discs.find((disc) => disc.id === 'a')?.phase).toBe('floating');
    expect(sample.discs.find((disc) => disc.id === 'e')?.phase).toBe('seated');
  });

  it('lets the latest pick win: a disc not yet committed to its drop goes home and never seats', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(3300);
    choreography.setLoaded('d', 3300, true);
    run(6000);
    expect(fired.filter((moment) => moment.seated).map((moment) => moment.disc)).toEqual(['d']);
    expect(cues(fired, 'disc-seat').map((moment) => moment.disc)).toEqual(['d']);
    expect(choreography.sample(6000).discs.find((disc) => disc.id === 'a')?.phase).toBe('floating');
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

  it('spins down from wherever the spin-up is when paused mid-way, and brakes on a stop', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    run(4100);
    const spinning = choreography.sample(4100).discs.find((disc) => disc.id === 'a')?.omega ?? 0;
    expect(spinning).toBeGreaterThan(0);
    expect(spinning).toBeLessThan(DISC_MOTION.playSpeed);
    choreography.setTransport('paused', 4100);
    run(4101);
    expect(choreography.sample(4101).discs.find((disc) => disc.id === 'a')?.omega).toBeCloseTo(spinning, 0);
    run(5000);
    expect(choreography.sample(5000).discs.find((disc) => disc.id === 'a')?.omega).toBeCloseTo(0, 6);
    choreography.setTransport('playing', 5000);
    run(5400);
    expect(choreography.sample(5400).discs.find((disc) => disc.id === 'a')?.omega).toBeCloseTo(
      DISC_MOTION.playSpeed,
      6,
    );
    choreography.setTransport('stopped', 5400);
    run(6600);
    expect(choreography.sample(6600).discs.find((disc) => disc.id === 'a')?.omega).toBeCloseTo(0, 6);
    expect(cues(fired, 'spin-up').map((moment) => moment.at)).toEqual([3890, 5000]);
    expect(cues(fired, 'spin-down').map((moment) => moment.at)).toEqual([4100, 5400]);
  });

  it('waits for the bottom of the press if the transport changes while the disc is still flying in', () => {
    const { choreography, fired, run } = arrive();
    choreography.setTransport('playing', 3000);
    choreography.setLoaded('a', 3000, true);
    choreography.setTransport('paused', 3200);
    run(5000);
    expect(cues(fired, 'spin-up')).toHaveLength(0);
    expect(choreography.sample(5000).discs.find((disc) => disc.id === 'a')?.omega).toBeCloseTo(0, 6);
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
    expect(cues(fired, 'key-up').at(-1)?.at).toBe(4060);
  });
});

describe('the leave', () => {
  it('sends the discs home edge-in, then closes the lid by the landing', () => {
    const { choreography, fired, run } = arrive();
    choreography.conceal(3000);
    run(4200);
    const sinks = cues(fired, 'disc-sink');
    expect(sinks.map((moment) => moment.disc)).toEqual(['e', 'a', 'd', 'b', 'c']);
    expect(sinks.map((moment) => moment.at)).toEqual([3000, 3045, 3090, 3135, 3180]);
    const close = cues(fired, 'lid-close')[0]?.at ?? 0;
    expect(close).toBeCloseTo(3000 + 180 + 340 + 140, -1);
    expect(cues(fired, 'lid-latch')[0]?.at).toBeCloseTo(close + 340, 6);
    expect(choreography.lidDegrees(3000 + LANDING)).toBe(0);
    expect(choreography.sample(4200).discs.every((disc) => !disc.visible)).toBe(true);
    expect(choreography.sample(4200).moving).toBe(false);
  });

  it('finishes an insert the visitor asked for within 200 ms; its seated moment still fires', () => {
    const { choreography, fired, run } = arrive();
    choreography.setLoaded('b', 3000, true);
    run(3300);
    choreography.conceal(3300);
    run(5000);
    const seated = fired.filter((moment) => moment.seated);
    expect(seated.map((moment) => moment.disc)).toEqual(['b']);
    expect((seated[0]?.at ?? 0) - 3300).toBeLessThanOrEqual(200);
    expect(choreography.lidDegrees(5000)).toBe(0);
  });

  it('turns back mid-leave: the lid swings open from where it is, discs above the radio return', () => {
    const { choreography, run } = arrive();
    choreography.conceal(3000);
    run(3700);
    const lid = choreography.lidDegrees(3700);
    choreography.approach(3700, 3700);
    run(3701);
    expect(Math.abs(choreography.lidDegrees(3701) - lid)).toBeLessThan(1);
    run(6000);
    expect(choreography.lidDegrees(6000)).toBeCloseTo(84, 0);
  });
});

describe('reduced motion', () => {
  it('cuts to the open lid and the discs in place, and seats a pick in one step', () => {
    const { choreography, fired, run } = arrive(true);
    expect(choreography.lidDegrees(140)).toBe(84);
    const sample = choreography.sample(300);
    expect(sample.discs.every((disc) => disc.phase === 'floating')).toBe(true);
    expect(sample.ambient).toBe(false);
    choreography.setTransport('playing', 400);
    choreography.setLoaded('a', 400, true);
    expect(choreography.sample(400).discs.find((disc) => disc.id === 'a')?.phase).toBe('seated');
    // ▷II drawn pressed for 120 ms; the seated disc never spins.
    expect(choreography.sample(450).keys.rockerTravel).toBe(1);
    expect(choreography.sample(530).keys.rockerTravel).toBe(0);
    expect(choreography.sample(2000).discs.find((disc) => disc.id === 'a')?.omega).toBe(0);
    // Nothing moves for more than 300 ms after an event.
    expect(choreography.sample(700).moving).toBe(false);
    choreography.conceal(1000);
    run(1200);
    expect(choreography.lidDegrees(1140)).toBe(0);
    expect(choreography.sample(1500).moving).toBe(false);
    // Only changes of state sound.
    const sounded = new Set(fired.map((moment) => moment.cue).filter((cue) => cue !== undefined));
    expect(
      [...sounded].every((cue) => ['lid-unlatch', 'lid-latch', 'disc-seat', 'key-down', 'key-up'].includes(cue ?? '')),
    ).toBe(true);
  });
});
