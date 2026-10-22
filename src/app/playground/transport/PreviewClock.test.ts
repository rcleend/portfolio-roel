import { describe, expect, it, vi } from 'vitest';
import { PreviewClock } from './PreviewClock';

/** One display frame of a 60 Hz screen, in ms. */
const VSYNC = 1000 / 60;

/** Ticks `clock` through `count` display frames and returns how many steps it moved in total. */
function run(clock: PreviewClock, count: number, frameMs = VSYNC): number {
  let steps = 0;
  for (let i = 0; i < count; i++) steps += clock.tick(frameMs);
  return steps;
}

describe('PreviewClock', () => {
  it('starts on the first frame, playing at full speed', () => {
    expect(new PreviewClock().state).toEqual({ frame: 0, playing: true, speed: 1 });
  });

  it('moves one frame per display frame at full speed, whatever the display rate', () => {
    const clock = new PreviewClock();
    expect(run(clock, 60)).toBe(60);
    expect(clock.state.frame).toBe(60);
    expect(run(clock, 120, VSYNC / 2)).toBe(60);
    expect(clock.state.frame).toBe(120);
  });

  it('slows to a half and a quarter of the frames at those speeds', () => {
    const clock = new PreviewClock();
    clock.setSpeed(0.5);
    expect(run(clock, 60)).toBe(30);
    clock.setSpeed(0.25);
    expect(run(clock, 60)).toBe(15);
    expect(clock.state).toMatchObject({ frame: 45, speed: 0.25 });
  });

  it('stands still while paused and does not catch up on play', () => {
    const clock = new PreviewClock();
    clock.pause();
    expect(run(clock, 30)).toBe(0);
    clock.play();
    expect(clock.tick(VSYNC)).toBe(1);
    expect(clock.state.frame).toBe(1);
  });

  it('slows down after a stall instead of leaping ahead', () => {
    const clock = new PreviewClock();
    expect(clock.tick(2000)).toBe(5);
    expect(clock.tick(VSYNC)).toBe(1);
  });

  it('seeks to whole frames, never before the first', () => {
    const clock = new PreviewClock();
    clock.seek(87.4);
    expect(clock.state.frame).toBe(87);
    clock.seek(-3);
    expect(clock.state.frame).toBe(0);
  });

  it('pauses to step one frame either way', () => {
    const clock = new PreviewClock();
    run(clock, 10);
    clock.step(1);
    expect(clock.state).toMatchObject({ frame: 11, playing: false });
    clock.step(-1);
    clock.step(-1);
    expect(clock.state.frame).toBe(9);
    clock.seek(0);
    clock.step(-1);
    expect(clock.state.frame).toBe(0);
  });

  it('replays from the first frame, playing even if it was paused', () => {
    const clock = new PreviewClock();
    run(clock, 90);
    clock.pause();
    clock.replay();
    expect(clock.state).toMatchObject({ frame: 0, playing: true });
  });

  it('tells subscribers about every change and nothing else', () => {
    const clock = new PreviewClock();
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);
    const before = clock.state;
    clock.play();
    clock.setSpeed(1);
    expect(listener).not.toHaveBeenCalled();
    expect(clock.state).toBe(before);

    clock.tick(VSYNC);
    clock.toggle();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(clock.state).not.toBe(before);

    unsubscribe();
    clock.toggle();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
