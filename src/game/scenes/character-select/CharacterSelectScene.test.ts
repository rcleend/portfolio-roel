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
import type { Sprites } from '../../art';
import { arcadeFont } from '../../art/fonts/arcade';
import { smallFont } from '../../art/fonts/small';
import type { MusicId, SfxId } from '../../audio/ids';
import { createTextStyles } from '../../fonts';
import type { Action } from '../../input/bindings';
import type { LevelArtLibrary } from '../../levels/art/LevelArt';
import type { GameServices } from '../../services';
import { SessionStore } from '../../session';
import { KeyHints } from '../../ui/KeyHints';
import type { GameSceneMap } from '../params';
import { CharacterSelectScene } from './CharacterSelectScene';
import { LEAVE_AT } from './choreography';
import { KEY_HINTS, SKILL_ROWS } from './layout';

const PRESSED: ActionState = { down: true, pressed: true, released: false };

/**
 * Wires the real scene to a real director whose other scenes are recorders,
 * with test doubles for everything that needs a canvas. Only `update` runs
 * here; how it looks is checked with screenshots.
 */
function setup(savedCharacter: (typeof characters)[number]['id'] | null = null) {
  const audio = new NullAudio<MusicId, SfxId>();
  const session = new SessionStore(null);
  session.update((state) => ({ ...state, characterId: savedCharacter }));
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
    sprites: {} as Sprites,
    assets: {} as AssetStore,
    levelArt: {} as LevelArtLibrary,
    session,
    rng: new Rng(1),
    settings: { reducedMotion: false },
    openLink: () => {},
  };
  director.goTo('characterSelect');

  let frame = 0;
  const step = (pressed: readonly Action[] = [], pointer: Partial<PointerSnapshot> = {}): void => {
    const input = new InputSnapshot<Action>(
      new Map(pressed.map((action) => [action, PRESSED])),
      { ...IDLE_POINTER, ...pointer },
      null,
    );
    director.update({ dt: 1 / 60, frame: frame++, input });
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
  it('starts on the last chosen character and plays the select music', () => {
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

  it('only chimes when focus actually moves', () => {
    const { audio, step } = setup();
    const skill = { x: SKILL_ROWS[0].x + 4, y: SKILL_ROWS[0].y + 4, over: true };
    step([], skill);
    step([], skill);
    step([], { ...skill, x: skill.x + 1 });
    expect(audio.playedSfx).toEqual(['menu-move']);
  });
});
