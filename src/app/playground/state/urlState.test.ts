import { describe, expect, it } from 'vitest';
import { TITLE_DEFAULTS } from '@/game/scenes/title/variants';
import { PLAYGROUND_BOARDS } from '../boards/catalog';
import { heroSubject, lookBoard } from '../boards/testing';
import { titleSubject } from '../boards/title';
import { defaultState, type PlaygroundState } from './playgroundState';
import { readUrlState, writeUrlState } from './urlState';

const BOARDS = [lookBoard];

describe('the URL state', () => {
  it('is empty for the page as it opens, and reads back as that page', () => {
    expect(writeUrlState(defaultState(BOARDS), BOARDS)).toBe('');
    expect(readUrlState('', BOARDS)).toEqual({ state: defaultState(BOARDS), problems: [] });
  });

  it('carries shared picks, the focused combination, the toggles and the zoom there and back', () => {
    const state: PlaygroundState = {
      shared: { looks: { view: 'card' } },
      focus: { subject: heroSubject, picks: { look: 'hibit', view: 'card' } },
      crt: true,
      reducedMotion: true,
      sound: true,
      zoom: 1,
    };
    const query = writeUrlState(state, BOARDS);
    expect(query).toBe('looks.view=card&focus=hero&focus.look=hibit&focus.view=card&crt=1&reduced=1&sound=1&zoom=1');
    expect(readUrlState(`?${query}`, BOARDS)).toEqual({ state, problems: [] });
  });

  it('spells out every pick of a focused combination, today’s choices included', () => {
    const state: PlaygroundState = {
      ...defaultState(BOARDS),
      focus: { subject: heroSubject, picks: { look: 'classic', view: 'moves' } },
    };
    expect(writeUrlState(state, BOARDS)).toBe('focus=hero&focus.look=classic&focus.view=moves');
  });

  it('fills picks a link leaves out with what the game shows today', () => {
    const { state, problems } = readUrlState('?focus=hero&focus.look=arcade', BOARDS);
    expect(state.focus).toEqual({ subject: heroSubject, picks: { look: 'arcade', view: 'moves' } });
    expect(problems).toEqual([]);
  });

  it('falls back to today’s choice for an unknown variant, and says which ones exist', () => {
    const { state, problems } = readUrlState('?looks.view=strip&focus=hero&focus.look=sepia', BOARDS);
    expect(state.shared).toEqual({ looks: { view: 'moves' } });
    expect(state.focus?.picks).toEqual({ look: 'classic', view: 'moves' });
    expect(problems).toEqual([
      'looks.view=strip: no view by that id (registered: moves, card)',
      'focus.look=sepia: no look by that id (registered: classic, arcade, hibit)',
    ]);
  });

  it('stays on the boards when asked to focus something it does not show', () => {
    const { state, problems } = readUrlState('?focus=boss&focus.look=arcade', BOARDS);
    expect(state.focus).toBeNull();
    expect(problems).toEqual([
      'focus=boss: nothing by that id to focus (hero)',
      'focus.look: not a playground setting',
    ]);
  });

  it('reports malformed toggles, zooms and settings it does not know', () => {
    const { state, problems } = readUrlState('?crt=yes&reduced=0&zoom=7&colour=red', BOARDS);
    expect(state).toEqual(defaultState(BOARDS));
    expect(problems).toEqual([
      'crt=yes: expected 1 or 0',
      'zoom=7: expected 1, 2, 3',
      'colour: not a playground setting',
    ]);
  });

  it('opens the real title boards on a focused title', () => {
    const { state, problems } = readUrlState('?focus=title', PLAYGROUND_BOARDS);
    expect(problems).toEqual([]);
    expect(state.focus).toEqual({
      subject: titleSubject,
      picks: { lockup: TITLE_DEFAULTS.lockup, backdrop: TITLE_DEFAULTS.backdrop },
    });
    expect(state.shared).toEqual({
      lockups: { backdrop: TITLE_DEFAULTS.backdrop },
      backdrops: { lockup: TITLE_DEFAULTS.lockup },
      characters: {},
      skills: {},
      customer: {},
    });
  });
});
