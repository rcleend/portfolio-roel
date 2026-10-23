import { describe, expect, it } from 'vitest';
import { type KeyPress, shortcutFor } from './shortcuts';

const press = (key: string, change: Partial<KeyPress> = {}): KeyPress => ({
  key,
  modified: false,
  repeat: false,
  owner: null,
  ...change,
});

describe('shortcutFor', () => {
  it('maps the transport keys, digits and Esc', () => {
    expect(shortcutFor(press('r'))).toEqual({ type: 'replay' });
    expect(shortcutFor(press('R'))).toEqual({ type: 'replay' });
    expect(shortcutFor(press(' '))).toEqual({ type: 'togglePlay' });
    expect(shortcutFor(press('ArrowLeft'))).toEqual({ type: 'step', delta: -1 });
    expect(shortcutFor(press('ArrowRight'))).toEqual({ type: 'step', delta: 1 });
    expect(shortcutFor(press('1'))).toEqual({ type: 'focusTile', index: 0 });
    expect(shortcutFor(press('9'))).toEqual({ type: 'focusTile', index: 8 });
    expect(shortcutFor(press('Escape'))).toEqual({ type: 'close' });
    expect(shortcutFor(press('0'))).toBeNull();
    expect(shortcutFor(press('x'))).toBeNull();
  });

  it('leaves keys with a modifier to the browser', () => {
    expect(shortcutFor(press('r', { modified: true }))).toBeNull();
    expect(shortcutFor(press('2', { modified: true }))).toBeNull();
  });

  it('leaves the focused control the keys it uses itself', () => {
    expect(shortcutFor(press(' ', { owner: 'button' }))).toBeNull();
    expect(shortcutFor(press('ArrowRight', { owner: 'button' }))).toEqual({ type: 'step', delta: 1 });
    expect(shortcutFor(press('ArrowRight', { owner: 'slider' }))).toBeNull();
    expect(shortcutFor(press(' ', { owner: 'slider' }))).toEqual({ type: 'togglePlay' });
    expect(shortcutFor(press('r', { owner: 'text' }))).toBeNull();
  });

  it('closes on Esc whatever has focus', () => {
    expect(shortcutFor(press('Escape', { owner: 'text', modified: true }))).toEqual({ type: 'close' });
  });

  it('repeats only frame steps while a key is held', () => {
    expect(shortcutFor(press('ArrowLeft', { repeat: true }))).toEqual({ type: 'step', delta: -1 });
    expect(shortcutFor(press(' ', { repeat: true }))).toBeNull();
    expect(shortcutFor(press('r', { repeat: true }))).toBeNull();
  });
});
