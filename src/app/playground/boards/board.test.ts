import { describe, expect, it } from 'vitest';
import { characters, levels, type SkillId, skills } from '@/content';
import { lookRegistry } from '@/game/art/looks/registry';
import { TITLE_BACKDROPS } from '@/game/scenes/title/backdrops';
import { TITLE_LOCKUPS } from '@/game/scenes/title/lockups';
import { TITLE_DEFAULTS } from '@/game/scenes/title/variants';
import { boardRows, boardTiles, pickerOf, sharedPickers } from './board';
import { PLAYGROUND_BOARDS, subjectsOf } from './catalog';
import { characterBoard, customerBoard, skillBoard } from './looks';
import { roelsBoard } from './roels';
import { chosen, currentPicks } from './subject';
import { heroSubject, lookBoard, testChoice } from './testing';
import { backdropBoard, lockupBoard, titleSubject } from './title';

const ids = (board: typeof lookBoard) => boardTiles(board, {}).map((tile) => tile.choice.id);

describe('boards', () => {
  it('give every choice of the compared picker a tile, in registry order, on the shared picks', () => {
    const tiles = boardTiles(lookBoard, { view: 'card' });
    expect(tiles.map((tile) => tile.key)).toEqual(['looks/hero/classic', 'looks/hero/arcade', 'looks/hero/hibit']);
    expect(tiles.map((tile) => tile.picks)).toEqual([
      { view: 'card', look: 'classic' },
      { view: 'card', look: 'arcade' },
      { view: 'card', look: 'hibit' },
    ]);
    expect(tiles.map((tile) => tile.current)).toEqual([true, false, false]);
    expect(tiles[1]?.choice).toEqual(testChoice('arcade'));
  });

  it('share the pickers they name and refuse ones their subjects lack', () => {
    expect(sharedPickers(lookBoard).map((picker) => picker.id)).toEqual(['view']);
    expect(() => pickerOf(heroSubject, 'mood')).toThrow(/no picker "mood"/);
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
    expect(ids(lockupBoard)).toEqual(TITLE_LOCKUPS.map((lockup) => lockup.id));
    expect(ids(backdropBoard)).toEqual(TITLE_BACKDROPS.map((backdrop) => backdrop.id));
    const current = boardTiles(lockupBoard, {}).filter((tile) => tile.current);
    expect(current.map((tile) => tile.choice.id)).toEqual([TITLE_DEFAULTS.lockup]);
  });

  it('show the real title scene at the picked lockup and backdrop', () => {
    expect(titleSubject.show({ lockup: TITLE_DEFAULTS.lockup, backdrop: TITLE_DEFAULTS.backdrop })).toEqual({
      spec: { scene: 'title', params: { lockup: TITLE_DEFAULTS.lockup, backdrop: TITLE_DEFAULTS.backdrop } },
      looks: {},
    });
  });
});

describe('the looks boards', () => {
  const { offer } = lookRegistry;

  it('give every hero a row with a tile per registered look, playing its moves in it', () => {
    const rows = boardRows(characterBoard, {});
    expect(rows.map(({ row }) => row.title)).toEqual(characters.map((hero) => hero.name));
    rows.forEach(({ tiles }, index) => {
      const hero = characters[index];
      if (!hero) throw new Error('a row per hero');
      expect(tiles.map((tile) => tile.choice.id)).toEqual(offer.characters[hero.id]);
      const last = tiles.at(-1);
      if (!last) throw new Error('a tile per look');
      expect(last.row.subject.show(last.picks)).toEqual({
        spec: { scene: 'showcase', params: { demo: 'moves', hero: hero.id } },
        looks: {
          characters: { [hero.id]: last.choice.id },
          skills: {},
          customer: undefined,
        },
      });
    });
  });

  it("give every skill a row under its hero, cast by the hero in the skill's look where it has one", () => {
    const rows = boardRows(skillBoard, {});
    const order = characters.flatMap((hero) => hero.skills);
    expect(rows.map(({ row }) => row.title)).toEqual(order.map((skill: SkillId) => skills[skill].name));
    expect(rows.filter(({ row }) => row.group).map(({ row }) => row.group)).toEqual(
      characters.map((hero) => hero.name),
    );
    rows.forEach(({ tiles }, index) => {
      const skill = order[index];
      if (!skill) throw new Error('a row per skill');
      expect(tiles.map((tile) => tile.choice.id)).toEqual(offer.skills[skill]);
    });
  });

  it('give the customer a tile per registered look', () => {
    expect(ids(customerBoard)).toEqual(offer.customer);
  });

  it('are on the page after the title boards, the Terraria Roels after the characters, each subject focusable once', () => {
    expect(PLAYGROUND_BOARDS).toEqual([
      lockupBoard,
      backdropBoard,
      characterBoard,
      roelsBoard,
      skillBoard,
      customerBoard,
    ]);
    const subjects = subjectsOf(PLAYGROUND_BOARDS);
    expect(subjects[0]).toBe(titleSubject);
    expect(new Set(subjects.map((subject) => subject.id)).size).toBe(subjects.length);
    expect(subjects).toHaveLength(1 + characters.length + 1 + levels.length + Object.keys(skills).length + 1);
  });
});

describe('the Terraria Roels board', () => {
  it('stands the classic cast, marked current, beside the Terraria designs on the select screen and every stage', () => {
    const rows = boardRows(roelsBoard, {});
    expect(rows.map(({ row }) => row.title)).toEqual(['MENU BLUEPRINT', ...levels.map((level) => level.city)]);
    for (const { tiles } of rows) {
      expect(tiles.map((tile) => [tile.choice.id, tile.current])).toEqual([
        ['game', true],
        ['terraria', false],
      ]);
    }
    const [menu, stage] = rows;
    expect(menu?.tiles[1]?.row.subject.show(menu.tiles[1].picks)).toEqual({
      spec: { scene: 'lineup', params: { cast: 'terraria', backdrop: 'menu' } },
      looks: {},
    });
    expect(stage?.tiles[0]?.row.subject.show(stage.tiles[0].picks)).toEqual({
      spec: { scene: 'lineup', params: { cast: 'game', backdrop: levels[0]?.id } },
      looks: {},
    });
  });
});
