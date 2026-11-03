import { describe, expect, it } from 'vitest';
import { characters } from '@/content';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { NullAudio } from '@/engine/audio/NullAudio';
import { Director, type SceneFactories } from '@/engine/core/Director';
import { RecordingScene } from '@/engine/core/testing';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { type ActionState, IDLE_POINTER, InputSnapshot, type PointerSnapshot } from '@/engine/input/InputSnapshot';
import type { Rect } from '@/engine/math/Rect';
import { Rng } from '@/engine/math/Rng';
import { arcadeFont } from '../../art/fonts/arcade';
import { smallFont } from '../../art/fonts/small';
import { sizedLooks } from '../../art/looks/testing';
import type { MusicId, SfxId } from '../../audio/ids';
import { createTextStyles } from '../../fonts';
import type { Action } from '../../input/bindings';
import type { LevelArtLibrary } from '../../levels/art/LevelArt';
import type { GameServices } from '../../services';
import { SESSION_STORAGE_KEY, type SessionStorage, SessionStore } from '../../session';
import { KeyHints } from '../../ui/KeyHints';
import type { GameSceneMap } from '../params';
import { CharacterSelectScene } from './CharacterSelectScene';
import { LEAVE_AT } from './choreography';
import { ARROW_LEFT_HIT, ARROW_RIGHT_HIT, CARD, KEY_HINTS, NAME_ROW, selectLayout } from './layout';

const PRESSED: ActionState = { down: true, pressed: true, released: false };

/**
 * Wires the real scene to a real director whose other scenes are recorders,
 * with test doubles for everything that needs a canvas. Only `update` runs
 * here; how it looks is checked with screenshots.
 */
function setup(savedCharacter: (typeof characters)[number]['id'] | null = null, session = new SessionStore(null)) {
  const audio = new NullAudio<MusicId, SfxId>();
  if (savedCharacter) session.update((state) => ({ ...state, characterId: savedCharacter }));
  const log: string[] = [];
  let services: GameServices | null = null;
  function record<K extends keyof GameSceneMap>(id: K): () => RecordingScene<GameSceneMap[K], Action> {
    return () => new RecordingScene<GameSceneMap[K], Action>(id, log);
  }
  const factories: SceneFactories<GameSceneMap, Action> = {
    boot: record('boot'),
    title: record('title'),
    characterSelect: () => {
      if (!services) throw new Error('services not ready');
      return new CharacterSelectScene(services);
    },
    levelSelect: record('levelSelect'),
    level: record('level'),
    stageClear: record('stageClear'),
    specimen: record('specimen'),
    showcase: record('showcase'),
    lineup: record('lineup'),
  };
  const director = new Director<GameSceneMap, Action>(factories);
  const small = BitmapFont.fromGlyphData(smallFont);
  const fonts = { small, label: small, arcade: BitmapFont.fromGlyphData(arcadeFont) };
  const text = createTextStyles(fonts);
  services = {
    director,
    audio,
    fonts,
    text,
    looks: sizedLooks(),
    assets: {} as AssetStore,
    levelArt: {} as LevelArtLibrary,
    session,
    rng: new Rng(1),
    settings: { reducedMotion: false, touchControls: false },
    openLink: () => {},
  };
  director.goTo('characterSelect');

  let frame = 0;
  /** One step; returns its input, which the scene marks while the pointer is over something clickable. */
  const step = (pressed: readonly Action[] = [], pointer: Partial<PointerSnapshot> = {}): InputSnapshot<Action> => {
    const input = new InputSnapshot<Action>(
      new Map(pressed.map((action) => [action, PRESSED])),
      { ...IDLE_POINTER, ...pointer },
      null,
    );
    director.update({ dt: 1 / 60, frame: frame++, input });
    return input;
  };
  const idle = (count: number): void => {
    for (let i = 0; i < count; i++) step();
  };
  // The scene's legend rebuilt from the same anchor and face, to find where its keys are.
  const keys = new KeyHints({ ...KEY_HINTS, style: text.label });
  return { audio, session, director, step, idle, keys };
}

const centre = (r: Rect): Partial<PointerSnapshot> => ({
  x: r.x + Math.floor(r.w / 2),
  y: r.y + Math.floor(r.h / 2),
  over: true,
});

describe('CharacterSelectScene', () => {
  it('starts every visit on ENGINEER, whatever an earlier visit picked', () => {
    const storage = new Map<string, string>([
      [SESSION_STORAGE_KEY, JSON.stringify({ version: 1, characterId: 'strategy', bootSeen: true })],
    ]);
    const stored: SessionStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
    };
    expect(characters[0]?.className).toBe('ENGINEER');
    const { step, session } = setup(null, new SessionStore(stored));
    step(['confirm']);
    expect(session.state.characterId).toBe('hackerman');
  });

  it('comes back, within a visit, to the character chosen on it, and plays the select music', () => {
    const { audio, step, session } = setup('strategy');
    expect(audio.currentMusic).toBe('select');
    // Strategy is last in the roster, so one step right wraps to the first character.
    step(['right']);
    step(['confirm']);
    expect(session.state.characterId).toBe(characters[0]?.id);
  });

  it('switches with left/right and commits the character on screen', () => {
    const { audio, step, session, director } = setup();
    step(['left']);
    expect(audio.playedSfx).toEqual(['menu-move']);
    step(['confirm']);
    expect(audio.playedSfx).toContain('menu-confirm');
    expect(session.state.characterId).toBe(characters.at(-1)?.id);
    expect(director.current).toBe('characterSelect');
  });

  it('holds on the victory beat, then moves on to the mission select exactly once', () => {
    const { step, idle, director } = setup();
    step(['confirm']);
    idle(Math.floor(LEAVE_AT * 60) - 2);
    expect(director.current).toBe('characterSelect');
    expect(director.transition).toBeNull();
    idle(4);
    expect(director.transition?.name).toBe('iris');
    idle(60);
    expect(director.current).toBe('levelSelect');
  });

  it('ignores further input once a character is chosen', () => {
    const { audio, step, session } = setup('hackerman');
    step(['confirm']);
    step(['right']);
    step(['back']);
    expect(session.state.characterId).toBe('hackerman');
    expect(audio.playedSfx).toEqual(['menu-confirm']);
  });

  it('goes back to the title on back', () => {
    const { audio, step, idle, director } = setup();
    step(['back']);
    expect(audio.playedSfx).toEqual(['menu-back']);
    idle(60);
    expect(director.current).toBe('title');
  });

  it('chooses when the CONFIRM key is clicked, on release', () => {
    const { audio, step, session, keys } = setup('artsy');
    const point = centre(keys.area('confirm'));
    step([], point);
    step([], { ...point, down: true, pressed: true });
    expect(audio.playedSfx).not.toContain('menu-confirm');
    step([], { ...point, released: true });
    expect(audio.playedSfx).toContain('menu-confirm');
    expect(session.state.characterId).toBe('artsy');
  });

  it('goes back to the title when the BACK key is clicked', () => {
    const { audio, step, idle, director, keys } = setup();
    const point = centre(keys.area('back'));
    step([], { ...point, down: true, pressed: true });
    step([], { ...point, released: true });
    expect(audio.playedSfx).toEqual(['menu-back']);
    idle(60);
    expect(director.current).toBe('title');
  });

  it('does not react to the skills: no sound or state on hover, tap or up/down', () => {
    const { audio, step, session } = setup('artsy');
    for (const row of selectLayout().skillRows) {
      const skill = { x: row.x + 4, y: row.y + 4, over: true };
      step([], skill);
      step([], { ...skill, x: skill.x + 1 });
      step([], { ...skill, down: true, pressed: true });
      step([], { ...skill, released: true });
    }
    step(['up']);
    step(['down']);
    expect(audio.playedSfx).toEqual([]);
    step(['confirm']);
    expect(session.state.characterId).toBe('artsy');
  });

  it("marks the arrows, the card (to a mouse) and the legend's keys clickable, and nothing else", () => {
    const { step, keys } = setup();
    const layout = selectLayout();
    const over = (target: Partial<PointerSnapshot>) => step([], target).overClickable;
    expect(over(centre(ARROW_LEFT_HIT))).toBe(true);
    expect(over(centre(ARROW_RIGHT_HIT))).toBe(true);
    expect(over(centre(CARD))).toBe(true);
    expect(over({ ...centre(CARD), kind: 'touch' })).toBe(false);
    expect(over(centre(keys.area('confirm')))).toBe(true);
    expect(over(centre(keys.area('back')))).toBe(true);
    expect(over(centre(NAME_ROW))).toBe(false);
    for (const row of layout.skillRows) expect(over(centre(row))).toBe(false);
    // Off the picture nothing is under the pointer.
    expect(over({ ...centre(CARD), over: false })).toBe(false);
  });

  it('stops marking the arrows and the card once a character is chosen', () => {
    const { step } = setup();
    step(['confirm']);
    expect(step([], centre(ARROW_LEFT_HIT)).overClickable).toBe(false);
    expect(step([], centre(CARD)).overClickable).toBe(false);
  });
});
