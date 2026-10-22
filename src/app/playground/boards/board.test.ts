import { describe, expect, it } from 'vitest';
import { TITLE_BACKDROPS } from '@/game/scenes/title/backdrops';
import { TITLE_LOCKUPS } from '@/game/scenes/title/lockups';
import { TITLE_DEFAULTS } from '@/game/scenes/title/variants';
import { boardTiles, comparedPicker, sharedPickers } from './board';
import { PLAYGROUND_BOARDS, subjectsOf } from './catalog';
import { chosen, currentPicks } from './subject';
import { heroSubject, lookBoard, testChoice } from './testing';
import { backdropBoard, lockupBoard, titleSubject } from './title';

describe('boards', () => {
  it('give every choice of the compared picker a tile, in registry order, on the shared picks', () => {
    const tiles = boardTiles(lookBoard, { view: 'card' });
    expect(tiles.map((tile) => tile.key)).toEqual(['looks/classic', 'looks/arcade', 'looks/hibit']);
    expect(tiles.map((tile) => tile.picks)).toEqual([
      { view: 'card', look: 'classic' },
      { view: 'card', look: 'arcade' },
      { view: 'card', look: 'hibit' },
    ]);
    expect(tiles.map((tile) => tile.current)).toEqual([true, false, false]);
    expect(tiles[1]?.choice).toEqual(testChoice('arcade'));
  });

  it('share every picker but the one they compare', () => {
    expect(comparedPicker(lookBoard).id).toBe('look');
    expect(sharedPickers(lookBoard).map((picker) => picker.id)).toEqual(['view']);
    expect(() => comparedPicker({ ...lookBoard, compares: 'mood' })).toThrow(/compares "mood"/);
  });

  it('read picks with today’s choice standing in for a missing or unknown one', () => {
    const [look, view] = heroSubject.pickers;
    if (!look || !view) throw new Error('fixture pickers missing');
    expect(currentPicks(heroSubject)).toEqual({ look: 'classic', view: 'moves' });
    expect(chosen(look, { look: 'hibit' }).id).toBe('hibit');
    expect(chosen(look, { look: 'sepia' }).id).toBe('classic');
    expect(chosen(view, {}).id).toBe('moves');
  });
});

describe('the title boards', () => {
  it('compare every registered lockup and every registered backdrop, today’s marked current', () => {
    expect(boardTiles(lockupBoard, currentPicks(titleSubject)).map((tile) => tile.choice.id)).toEqual(
      TITLE_LOCKUPS.map((lockup) => lockup.id),
    );
    expect(boardTiles(backdropBoard, currentPicks(titleSubject)).map((tile) => tile.choice.id)).toEqual(
      TITLE_BACKDROPS.map((backdrop) => backdrop.id),
    );
    const current = boardTiles(lockupBoard, {}).filter((tile) => tile.current);
    expect(current.map((tile) => tile.choice.id)).toEqual([TITLE_DEFAULTS.lockup]);
  });

  it('preview the real title scene at the picked lockup and backdrop', () => {
    expect(titleSubject.preview({ lockup: TITLE_DEFAULTS.lockup, backdrop: TITLE_DEFAULTS.backdrop })).toEqual({
      scene: 'title',
      params: { lockup: TITLE_DEFAULTS.lockup, backdrop: TITLE_DEFAULTS.backdrop },
    });
  });

  it('are the boards the page shows, sharing one subject', () => {
    expect(PLAYGROUND_BOARDS).toEqual([lockupBoard, backdropBoard]);
    expect(subjectsOf(PLAYGROUND_BOARDS)).toEqual([titleSubject]);
  });
});
