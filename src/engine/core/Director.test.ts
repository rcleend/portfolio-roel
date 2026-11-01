import { describe, expect, it } from 'vitest';
import { InputSnapshot } from '../input/InputSnapshot';
import { Director } from './Director';
import { RecordingScene, stepWith } from './testing';
import { cut, fade, flash, type Transition } from './transitions';

type Map = { a: void; b: { n: number } };

function setup() {
  const log: string[] = [];
  const scenes: RecordingScene<unknown>[] = [];
  const make = (name: string) => () => {
    const scene = new RecordingScene<unknown>(name, log);
    scenes.push(scene);
    return scene;
  };
  const director = new Director<Map>({ a: make('a'), b: make('b') });
  return { director, log, scenes };
}

const frames = (outFrames: number, inFrames: number): Transition => ({
  name: 'test',
  outFrames,
  inFrames,
  render: () => {},
});

describe('Director', () => {
  it('enters the first scene immediately with its params', () => {
    const { director, log } = setup();
    director.goTo('b', { n: 1 });
    expect(director.current).toBe('b');
    expect(log).toEqual(['b.enter({"n":1})']);
  });

  it('cuts between scenes, exiting the old one first and creating a fresh instance', () => {
    const { director, log, scenes } = setup();
    director.goTo('a');
    director.goTo('b', { n: 2 }, cut());
    director.goTo('a');
    expect(log).toEqual(['a.enter()', 'a.exit', 'b.enter({"n":2})', 'b.exit', 'a.enter()']);
    expect(scenes).toHaveLength(3);
  });

  it('switches at full coverage and reveals the new scene afterwards', () => {
    const { director, log } = setup();
    director.goTo('a');
    director.goTo('b', { n: 3 }, frames(2, 2));
    expect(director.current).toBe('a');
    expect(director.transition).toEqual({ name: 'test', phase: 'out', coverage: 0 });
    director.update(stepWith());
    expect(director.transition?.coverage).toBe(0.5);
    director.update(stepWith());
    expect(director.current).toBe('b');
    expect(director.transition).toEqual({ name: 'test', phase: 'in', coverage: 1 });
    director.update(stepWith());
    expect(director.transition?.coverage).toBe(0.5);
    director.update(stepWith());
    expect(director.transition).toBeNull();
    expect(log).toEqual(['a.enter()', 'a.exit', 'b.enter({"n":3})']);
  });

  it('feeds idle input to scenes while a transition runs', () => {
    const { director, scenes } = setup();
    director.goTo('a');
    director.goTo('b', { n: 0 }, frames(3, 0));
    const pressed = new InputSnapshot<string>(
      new globalThis.Map([['x', { down: true, pressed: true, released: false }]]),
      InputSnapshot.empty().pointer,
      'keyboard',
    );
    director.update(stepWith(pressed));
    expect(scenes[0]?.lastStep?.input.anyPressed).toBe(false);
    director.update(stepWith(pressed));
    director.update(stepWith(pressed));
    director.update(stepWith(pressed));
    expect(director.transition).toBeNull();
    expect(scenes[1]?.lastStep?.input.anyPressed).toBe(true);
  });

  it('defers a switch requested during a scene update until that update returns', () => {
    const { director, log, scenes } = setup();
    director.goTo('a');
    const first = scenes[0];
    if (!first) throw new Error('scene missing');
    first.onUpdate = () => {
      director.goTo('b', { n: 9 });
      log.push('a.update-finished');
    };
    director.update(stepWith());
    expect(log).toEqual(['a.enter()', 'a.update-finished', 'a.exit', 'b.enter({"n":9})']);
  });

  it('queues the latest request made during a transition', () => {
    const { director } = setup();
    director.goTo('a');
    director.goTo('b', { n: 1 }, frames(1, 1));
    director.goTo('a', undefined, cut());
    director.goTo('b', { n: 2 }, cut());
    director.update(stepWith());
    expect(director.current).toBe('b');
    director.update(stepWith());
    expect(director.current).toBe('b');
    expect(director.transition).toBeNull();
  });

  it('notifies scene-change listeners', () => {
    const { director } = setup();
    const seen: string[] = [];
    const off = director.onSceneChange((id) => seen.push(id));
    director.goTo('a');
    director.goTo('b', { n: 1 });
    off();
    director.goTo('a');
    expect(seen).toEqual(['a', 'b']);
  });

  it('gives built-in transitions sensible frame counts', () => {
    expect(fade({ duration: 0.5 })).toMatchObject({ outFrames: 15, inFrames: 15 });
    expect(flash()).toMatchObject({ outFrames: 2 });
    expect(cut()).toMatchObject({ outFrames: 0, inFrames: 0 });
  });

  it("shows the active scene's cursor, and the game's hand mid-transition when nothing can be clicked", () => {
    const pointing = new RecordingScene<void>('pointing', []);
    const director = new Director<{ a: void; b: void }>({
      a: () => Object.assign(new RecordingScene<void>('a', []), { cursor: () => 'attack-right' as const }),
      b: () => pointing,
    });
    expect(director.cursor()).toBe('hand');
    director.goTo('a');
    expect(director.cursor()).toBe('attack-right');
    director.goTo('b', undefined, frames(2, 2));
    expect(director.cursor()).toBe('hand');
    for (let i = 0; i < 4; i++) director.update(stepWith());
    expect(director.transition).toBeNull();
    // A scene without a cursor of its own shows the hand.
    expect(director.cursor()).toBe('hand');
  });
});
