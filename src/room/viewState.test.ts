import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW_STATE, type RoomView, reduceView, type ViewState } from './viewState';

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

  it.each(['desk', 'drawer'] as const)('keeps the game and its input off while exploring %s', (view) => {
    const leaving = reduceView(INITIAL_VIEW_STATE, { type: 'request', view });
    expect(leaving.effects).toContain('pauseGame');
    expect(leaving.effects).toContain('disableInput');
    const arrived = reduceView(leaving.state, { type: 'arrived' });
    expect(arrived.state).toEqual({ view, moving: false });
    expect(arrived.effects).toEqual([]);
  });

  it('only resumes at the TV after visiting several sections', () => {
    let state = INITIAL_VIEW_STATE;
    for (const view of ['room', 'desk', 'drawer', 'room'] satisfies RoomView[]) {
      state = reduceView(state, { type: 'request', view }).state;
      const arrival = reduceView(state, { type: 'arrived' });
      expect(arrival.effects).not.toContain('enableInput');
      expect(arrival.effects).not.toContain('resumeGame');
      state = arrival.state;
    }
    state = reduceView(state, { type: 'request', view: 'tv' }).state;
    expect(reduceView(state, { type: 'arrived' }).effects).toEqual(['resumeGame', 'enableInput']);
  });
});
