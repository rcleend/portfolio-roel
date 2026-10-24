import { describe, expect, it } from 'vitest';
import {
  APPROACH_EFFECTS,
  INITIAL_VIEW_STATE,
  LEAVING_EFFECTS,
  type RoomView,
  reduceView,
  type ViewState,
} from './viewState';

const settled = (view: RoomView): ViewState => ({ view, moving: false });
const moving = (view: RoomView): ViewState => ({ view, moving: true });

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
    const leaving = reduceView(settled('room'), { type: 'request', view: 'tv' });
    expect(leaving.effects).toEqual(['moveCamera', 'notify']);
    const arrived = reduceView(leaving.state, { type: 'arrived' });
    expect(arrived.state).toEqual({ view: 'tv', moving: false });
    expect(arrived.effects).toEqual(['resumeGame', 'enableInput']);
  });

  it('does nothing on arrival in the room', () => {
    expect(reduceView(moving('room'), { type: 'arrived' })).toEqual({ state: settled('room'), effects: [] });
  });

  it.each([settled('tv'), settled('room'), settled('pc'), moving('tv'), moving('room'), moving('pc')])(
    'ignores a request for the view it is at or flying to (%o)',
    (state) => {
      expect(reduceView(state, { type: 'request', view: state.view })).toEqual({ state, effects: [] });
    },
  );

  it.each(['tv', 'room', 'pc'] as const)('ignores a stray arrival while settled at %s', (view) => {
    expect(reduceView(settled(view), { type: 'arrived' })).toEqual({ state: settled(view), effects: [] });
  });

  it('reverses mid-flight without resuming early', () => {
    const toRoom = reduceView(INITIAL_VIEW_STATE, { type: 'request', view: 'room' }).state;
    const back = reduceView(toRoom, { type: 'request', view: 'tv' });
    expect(back.state).toEqual({ view: 'tv', moving: true });
    expect(back.effects).not.toContain('resumeGame');
  });

  it.each([settled('tv'), settled('room'), moving('tv'), moving('room')])(
    'flies to the computer from %o with the game paused and its input off',
    (state) => {
      const { state: next, effects } = reduceView(state, { type: 'request', view: 'pc' });
      expect(next).toEqual(moving('pc'));
      expect(effects).toEqual(['disableInput', 'pauseGame', 'moveCamera', 'notify']);
    },
  );

  it('shows the live screen only once the camera has landed on the computer', () => {
    expect(reduceView(moving('pc'), { type: 'arrived' })).toEqual({
      state: settled('pc'),
      effects: ['revealScreen'],
    });
  });

  it.each([settled('pc'), moving('pc')])('hides the screen before pulling back to the room from %o', (state) => {
    const { state: next, effects } = reduceView(state, { type: 'request', view: 'room' });
    expect(next).toEqual(moving('room'));
    expect(effects).toEqual(['concealScreen', 'disableInput', 'pauseGame', 'moveCamera', 'notify']);
  });

  it.each([settled('pc'), moving('pc')])('hides the screen before flying to the TV from %o', (state) => {
    const { state: next, effects } = reduceView(state, { type: 'request', view: 'tv' });
    expect(next).toEqual(moving('tv'));
    expect(effects).toEqual(['concealScreen', 'moveCamera', 'notify']);
  });

  it('hides the screen before the camera moves', () => {
    const { effects } = reduceView(settled('pc'), { type: 'request', view: 'room' });
    expect(effects.indexOf('concealScreen')).toBeLessThan(effects.indexOf('moveCamera'));
  });

  it('never reveals the screen after a landing on the computer was interrupted', () => {
    let state = reduceView(settled('room'), { type: 'request', view: 'pc' }).state;
    const interrupted = reduceView(state, { type: 'request', view: 'room' });
    expect(interrupted.effects).toContain('concealScreen');
    state = interrupted.state;
    expect(reduceView(state, { type: 'arrived' }).effects).not.toContain('revealScreen');
  });

  it('only resumes at the TV after several visits to the computer', () => {
    let state = INITIAL_VIEW_STATE;
    for (const view of ['room', 'pc', 'room', 'pc', 'room'] satisfies RoomView[]) {
      state = reduceView(state, { type: 'request', view }).state;
      const arrival = reduceView(state, { type: 'arrived' });
      expect(arrival.effects).not.toContain('enableInput');
      expect(arrival.effects).not.toContain('resumeGame');
      state = arrival.state;
    }
    state = reduceView(state, { type: 'request', view: 'tv' }).state;
    expect(reduceView(state, { type: 'arrived' }).effects).toEqual(['resumeGame', 'enableInput']);
  });

  describe('the radio', () => {
    it.each([settled('tv'), settled('room'), moving('tv'), moving('room')])(
      'flies to the radio from %o with the game paused, waking it once the camera is under way',
      (state) => {
        const { state: next, effects } = reduceView(state, { type: 'request', view: 'radio' });
        expect(next).toEqual(moving('radio'));
        expect(effects).toEqual(['disableInput', 'pauseGame', 'moveCamera', 'approachRadio', 'notify']);
      },
    );

    it.each([settled('pc'), moving('pc')])(
      'hides the computer screen first when flying from %o to the radio',
      (state) => {
        expect(reduceView(state, { type: 'request', view: 'radio' }).effects).toEqual([
          'concealScreen',
          'disableInput',
          'pauseGame',
          'moveCamera',
          'approachRadio',
          'notify',
        ]);
      },
    );

    it('lets the controls go live only once the camera has landed', () => {
      expect(reduceView(moving('radio'), { type: 'arrived' })).toEqual({
        state: settled('radio'),
        effects: ['revealRadio'],
      });
    });

    it.each([
      [settled('radio'), 'room'],
      [moving('radio'), 'room'],
      [settled('radio'), 'pc'],
      [moving('radio'), 'pc'],
    ] as const)('closes up the radio before the camera leaves %o for %s', (state, view) => {
      const { state: next, effects } = reduceView(state, { type: 'request', view });
      expect(next).toEqual(moving(view));
      expect(effects).toEqual(['concealRadio', 'disableInput', 'pauseGame', 'moveCamera', 'notify']);
      expect(effects.indexOf('concealRadio')).toBeLessThan(effects.indexOf('moveCamera'));
    });

    it.each([settled('radio'), moving('radio')])('closes up the radio before flying from %o to the TV', (state) => {
      const { state: next, effects } = reduceView(state, { type: 'request', view: 'tv' });
      expect(next).toEqual(moving('tv'));
      expect(effects).toEqual(['concealRadio', 'moveCamera', 'notify']);
    });

    it.each([settled('radio'), moving('radio')])(
      'ignores a request for the radio while at or flying to it (%o)',
      (state) => {
        expect(reduceView(state, { type: 'request', view: 'radio' })).toEqual({ state, effects: [] });
      },
    );

    it('never reveals the controls after a landing at the radio was interrupted', () => {
      const flying = reduceView(settled('room'), { type: 'request', view: 'radio' }).state;
      const back = reduceView(flying, { type: 'request', view: 'room' });
      expect(back.effects).toContain('concealRadio');
      expect(reduceView(back.state, { type: 'arrived' }).effects).not.toContain('revealRadio');
    });

    it('approaches only after the camera starts moving', () => {
      const { effects } = reduceView(settled('room'), { type: 'request', view: 'radio' });
      expect(effects.indexOf('approachRadio')).toBeGreaterThan(effects.indexOf('moveCamera'));
    });

    it('keeps the leaving and approaching effects in tables', () => {
      expect(LEAVING_EFFECTS).toEqual({ tv: [], room: [], pc: ['concealScreen'], radio: ['concealRadio'] });
      expect(APPROACH_EFFECTS).toEqual({ tv: [], room: [], pc: [], radio: ['approachRadio'] });
    });
  });
});
