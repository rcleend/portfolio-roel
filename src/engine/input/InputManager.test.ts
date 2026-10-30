// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { InputBindings } from './bindings';
import { GamepadSource } from './GamepadSource';
import { InputManager } from './InputManager';
import { KeyboardSource } from './KeyboardSource';

type Action = 'jump' | 'left' | 'confirm';

const bindings: InputBindings<Action> = {
  jump: { keys: ['KeyZ', 'Space'], buttons: [0] },
  left: { keys: ['ArrowLeft'], axes: [{ axis: 0, direction: -1 }] },
  confirm: { keys: ['Enter'] },
};

const managers: InputManager<Action>[] = [];

function setup(gamepads: (Gamepad | null)[] = []) {
  const gameKeys = new Set(['KeyZ', 'Space', 'ArrowLeft', 'Enter']);
  const keyboard = new KeyboardSource((code) => gameKeys.has(code));
  const input = new InputManager(bindings, { keyboard, gamepad: new GamepadSource(() => gamepads) });
  managers.push(input);
  return input;
}

function key(type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent(type, { code, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

function fakePad(pressed: number[], axes: number[] = [0, 0]): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: pressed.includes(i),
    touched: false,
    value: pressed.includes(i) ? 1 : 0,
  }));
  return { connected: true, buttons, axes } as unknown as Gamepad;
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
});

describe('InputManager', () => {
  it('reports press, hold and release on consecutive steps', () => {
    const input = setup();
    key('keydown', 'KeyZ');
    const first = input.poll();
    expect([first.wasPressed('jump'), first.isDown('jump'), first.wasReleased('jump')]).toEqual([true, true, false]);
    const held = input.poll();
    expect([held.wasPressed('jump'), held.isDown('jump')]).toEqual([false, true]);
    key('keyup', 'KeyZ');
    const released = input.poll();
    expect([released.wasPressed('jump'), released.isDown('jump'), released.wasReleased('jump')]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('never loses a tap that starts and ends between two steps', () => {
    const input = setup();
    key('keydown', 'Enter');
    key('keyup', 'Enter');
    const snapshot = input.poll();
    expect(snapshot.wasPressed('confirm')).toBe(true);
    expect(snapshot.wasReleased('confirm')).toBe(true);
    expect(snapshot.isDown('confirm')).toBe(false);
    expect(input.poll().wasPressed('confirm')).toBe(false);
  });

  it('counts a release and re-press within one step as a new press', () => {
    const input = setup();
    key('keydown', 'KeyZ');
    input.poll();
    key('keyup', 'KeyZ');
    key('keydown', 'KeyZ');
    const snapshot = input.poll();
    expect(snapshot.wasPressed('jump')).toBe(true);
    expect(snapshot.isDown('jump')).toBe(true);
  });

  it('does not re-press an action when a second bound key joins', () => {
    const input = setup();
    key('keydown', 'KeyZ');
    input.poll();
    key('keydown', 'Space');
    expect(input.poll().wasPressed('jump')).toBe(false);
    key('keyup', 'KeyZ');
    const snapshot = input.poll();
    expect(snapshot.isDown('jump')).toBe(true);
    expect(snapshot.wasReleased('jump')).toBe(false);
  });

  it('ignores auto-repeat keydown events', () => {
    const input = setup();
    key('keydown', 'ArrowLeft');
    input.poll();
    key('keydown', 'ArrowLeft', { repeat: true });
    expect(input.poll().wasPressed('left')).toBe(false);
  });

  it('prevents default only for game keys while enabled', () => {
    const input = setup();
    expect(key('keydown', 'ArrowLeft').defaultPrevented).toBe(true);
    expect(key('keydown', 'KeyQ').defaultPrevented).toBe(false);
    expect(key('keydown', 'Enter', { metaKey: true }).defaultPrevented).toBe(false);
    input.setEnabled(false);
    expect(key('keydown', 'Space').defaultPrevented).toBe(false);
  });

  it('ignores the keyboard and gamepad while disabled and drops held keys', () => {
    const input = setup([fakePad([0])]);
    key('keydown', 'ArrowLeft');
    input.setEnabled(false);
    const snapshot = input.poll();
    expect(snapshot.isDown('left')).toBe(false);
    expect(snapshot.isDown('jump')).toBe(false);
    input.setEnabled(true);
    expect(input.poll().isDown('jump')).toBe(true);
  });

  it('reads gamepad buttons and stick directions', () => {
    const pads: (Gamepad | null)[] = [fakePad([], [-0.9, 0])];
    const input = setup(pads);
    const snapshot = input.poll();
    expect(snapshot.wasPressed('left')).toBe(true);
    expect(snapshot.lastDevice).toBe('gamepad');
    pads[0] = fakePad([], [-0.2, 0]);
    expect(input.poll().wasReleased('left')).toBe(true);
  });

  it('presses actions through virtual buttons', () => {
    const input = setup();
    input.virtual.press('confirm');
    const snapshot = input.poll();
    expect(snapshot.wasPressed('confirm')).toBe(true);
    expect(snapshot.lastDevice).toBe('touch');
    input.virtual.release('confirm');
    expect(input.poll().wasReleased('confirm')).toBe(true);
  });

  it('tracks pointer edges in native pixels and counts clicks as any-press', () => {
    const input = setup();
    input.pointer.move(10.7, 20.2);
    input.pointer.down();
    const pressed = input.poll();
    expect(pressed.pointer).toMatchObject({ x: 10, y: 20, over: true, down: true, pressed: true });
    expect(pressed.anyPressed).toBe(true);
    expect(pressed.lastDevice).toBe('pointer');
    input.pointer.leave();
    const left = input.poll();
    expect(left.pointer).toMatchObject({ over: false, down: false, released: true });
  });

  it('tells pointing from keys: the pointer on the screen until a key, a pad or a virtual button is pressed', () => {
    const input = setup();
    expect(input.poll().pointing).toBe(false);
    input.pointer.move(40, 50);
    expect(input.poll().pointing).toBe(true);
    // Still pointing while nothing else happens, and through a transition's idle copy.
    const resting = input.poll();
    expect(resting.pointing).toBe(true);
    expect(resting.idle().pointing).toBe(true);
    key('keydown', 'ArrowLeft');
    expect(input.poll().pointing).toBe(false);
    key('keyup', 'ArrowLeft');
    // A host re-sending the resting pointer's place is not the visitor moving it.
    input.pointer.move(40, 50);
    expect(input.poll().pointing).toBe(false);
    input.pointer.down();
    expect(input.poll().pointing).toBe(true);
    input.pointer.up();
    input.virtual.press('confirm');
    expect(input.poll().pointing).toBe(false);
    expect(input.pointing).toBe(false);
  });

  it('produces immutable snapshots and an idle copy without presses', () => {
    const input = setup();
    key('keydown', 'Enter');
    input.pointer.move(5, 6);
    const snapshot = input.poll();
    expect(Object.isFrozen(snapshot)).toBe(true);
    const idle = snapshot.idle();
    expect(idle.anyPressed).toBe(false);
    expect(idle.isDown('confirm')).toBe(false);
    expect(idle.pointer).toMatchObject({ x: 5, y: 6, over: true });
  });
});
