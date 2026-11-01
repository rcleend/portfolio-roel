// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { InputManager } from '../input/InputManager';
import { Game } from './Game';
import type { GameRoot, Step } from './Scene';
import { ManualScheduler, nullContext } from './testing';

function setup() {
  const steps: Step[] = [];
  let renders = 0;
  const root: GameRoot = {
    update: (step) => steps.push(step),
    render: () => {
      renders++;
    },
  };
  const scheduler = new ManualScheduler();
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const input = new InputManager<'a'>({ a: { keys: ['KeyA'] } }, { keyboard: null });
  const context = nullContext();
  const game = new Game({ canvas, input, root, context, scheduler, visibility: document });
  return { game, steps, scheduler, canvas, context, renders: () => renders };
}

describe('Game', () => {
  it('runs fixed steps from animation frames and renders once per advancing frame', () => {
    const { game, steps, scheduler, renders } = setup();
    let notified = 0;
    game.onFrame(() => notified++);
    game.start();
    scheduler.frame(0);
    expect(steps).toHaveLength(0);
    scheduler.frame(1000 / 60);
    scheduler.frame((2 * 1000) / 60);
    expect(steps.map((s) => s.frame)).toEqual([0, 1]);
    expect(steps[0]?.dt).toBeCloseTo(1 / 60);
    expect(renders()).toBe(2);
    expect(notified).toBe(2);
  });

  it('does not render frames in which no step ran', () => {
    const { game, scheduler, renders } = setup();
    game.start();
    scheduler.frame(0);
    scheduler.frame(4);
    expect(renders()).toBe(0);
  });

  it('caps catch-up at five steps after a stall', () => {
    const { game, steps, scheduler } = setup();
    game.start();
    scheduler.frame(0);
    scheduler.frame(2000);
    expect(steps).toHaveLength(5);
  });

  it('stops advancing while paused and does not fast-forward on resume', () => {
    const { game, steps, scheduler } = setup();
    game.start();
    scheduler.frame(0);
    game.pause();
    scheduler.frame(100);
    scheduler.frame(5000);
    expect(steps).toHaveLength(0);
    expect(game.paused).toBe(true);
    game.resume();
    scheduler.frame(5010);
    scheduler.frame(5010 + 1000 / 60);
    expect(steps).toHaveLength(1);
  });

  it('steps synchronously while paused, rendering once', () => {
    const { game, steps, renders } = setup();
    game.pause();
    game.step(10);
    expect(steps).toHaveLength(10);
    expect(renders()).toBe(1);
    expect(game.frame).toBe(10);
  });

  it('auto-pauses while the document is hidden without reporting paused', () => {
    const { game, steps, scheduler } = setup();
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    game.start();
    scheduler.frame(0);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    scheduler.frame(1000);
    expect(steps).toHaveLength(0);
    expect(game.paused).toBe(false);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    scheduler.frame(60_000);
    scheduler.frame(60_000 + 1000 / 60);
    expect(steps).toHaveLength(1);
  });

  it('stops the loop and can unsubscribe frame listeners', () => {
    const { game, scheduler } = setup();
    let notified = 0;
    const unsubscribe = game.onFrame(() => notified++);
    unsubscribe();
    game.step();
    expect(notified).toBe(0);
    game.start();
    expect(game.running).toBe(true);
    game.stop();
    expect(game.running).toBe(false);
    expect(scheduler.pending).toBe(false);
  });

  // A GPU process reset (a laptop's sleep, a display change) gives the canvas back blank: a paused game drew nothing
  // more, and the TV showed a blank picture until it resumed.
  it('draws its frame again, paused or not, when the canvas comes back from a lost context', () => {
    const { game, scheduler, canvas, context, renders } = setup();
    let notified = 0;
    game.onFrame(() => notified++);
    game.start();
    game.pause();
    scheduler.frame(0);
    scheduler.frame(1000);
    expect(renders()).toBe(0);
    context.imageSmoothingEnabled = true;
    canvas.dispatchEvent(new Event('contextrestored'));
    scheduler.frame(1016);
    expect(renders()).toBe(1);
    expect(notified).toBe(1);
    expect(context.imageSmoothingEnabled).toBe(false);
    scheduler.frame(1032);
    expect(renders()).toBe(1);
  });

  it('stops redrawing on lost contexts once stopped', () => {
    const { game, scheduler, canvas, renders } = setup();
    game.start();
    game.stop();
    canvas.dispatchEvent(new Event('contextrestored'));
    game.start();
    scheduler.frame(0);
    expect(renders()).toBe(0);
  });
});
