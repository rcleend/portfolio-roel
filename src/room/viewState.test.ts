import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW_STATE, reduceView, type ViewState } from './viewState';

describe('reduceView', () => {
  it('starts settled on the TV', () => {
    expect(INITIAL_VIEW_STATE).toEqual({ view: 'tv', moving: false });
  });

  it('freezes the game immediately when leaving the TV', () => {
    const { state, effects } = reduceView(INITIAL_VIEW_STATE, { type: 'request', view: 'room' });
    expect(state).toEqual({ view: 'room', moving: true });
    expect(effects).toEqual(['disableInput', 'pauseGame', 'moveCamera', 'notify']);
  });

  it('resumes the game only after arriving back at the TV', () => {
    const room: ViewState = { view: 'room', moving: false };
    const leaving = reduceView(room, { type: 'request', view: 'tv' });
    expect(leaving.effects).toEqual(['moveCamera', 'notify']);
    const arrived = reduceView(leaving.state, { type: 'arrived' });
    expect(arrived.state).toEqual({ view: 'tv', moving: false });
    expect(arrived.effects).toEqual(['resumeGame', 'enableInput']);
  });

  it('does nothing on arrival in the room', () => {
    const moving: ViewState = { view: 'room', moving: true };
    expect(reduceView(moving, { type: 'arrived' })).toEqual({ state: { view: 'room', moving: false }, effects: [] });
  });

  it('ignores requests for the current view and stray arrivals', () => {
    expect(reduceView(INITIAL_VIEW_STATE, { type: 'request', view: 'tv' }).effects).toEqual([]);
    expect(reduceView(INITIAL_VIEW_STATE, { type: 'arrived' }).effects).toEqual([]);
  });

  it('reverses mid-flight without resuming early', () => {
    const toRoom = reduceView(INITIAL_VIEW_STATE, { type: 'request', view: 'room' }).state;
    const back = reduceView(toRoom, { type: 'request', view: 'tv' });
    expect(back.state).toEqual({ view: 'tv', moving: true });
    expect(back.effects).not.toContain('resumeGame');
  });
});
