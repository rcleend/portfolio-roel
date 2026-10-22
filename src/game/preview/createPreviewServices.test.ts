import { describe, expect, it } from 'vitest';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { NullAudio } from '@/engine/audio/NullAudio';
import { sizedLooks } from '../art/looks/testing';
import type { MusicId, SfxId } from '../audio/ids';
import type { GameFonts, TextStyles } from '../fonts';
import type { LevelArtLibrary } from '../levels/art/LevelArt';
import type { GameResources } from '../resources';
import { defaultSession } from '../session';
import { createPreviewServices } from './createPreviewServices';

const resources: GameResources = {
  assets: {} as AssetStore,
  fonts: {} as GameFonts,
  text: {} as TextStyles,
  levelArt: {} as LevelArtLibrary,
};
const looks = sizedLooks();

describe('createPreviewServices', () => {
  it('shares the loaded resources and the looks it is given instead of loading its own', () => {
    const services = createPreviewServices(resources, { reducedMotion: false, looks });
    expect(services).toMatchObject(resources);
    expect(services.fonts).toBe(resources.fonts);
    expect(services.levelArt).toBe(resources.levelArt);
    expect(services.looks).toBe(looks);
  });

  it('starts every build from a fresh session that lives in memory', () => {
    const first = createPreviewServices(resources, { reducedMotion: false, looks });
    first.session.update((state) => ({ ...state, bootSeen: true, characterId: 'artsy' }));
    expect(createPreviewServices(resources, { reducedMotion: false, looks }).session.state).toEqual(defaultSession());
  });

  it('records where a scene asks to go instead of going there', () => {
    const { director } = createPreviewServices(resources, { reducedMotion: false, looks });
    director.goTo('characterSelect');
    director.goTo('levelSelect', { focus: 'luna' });
    expect(director.requests).toEqual([
      { scene: 'characterSelect', params: undefined },
      { scene: 'levelSelect', params: { focus: 'luna' } },
    ]);
    expect(director.current).toBeNull();
  });

  it('stays silent unless it is given somewhere to play', () => {
    expect(createPreviewServices(resources, { reducedMotion: false, looks }).audio).toBeInstanceOf(NullAudio);
    const audio = new NullAudio<MusicId, SfxId>();
    expect(createPreviewServices(resources, { reducedMotion: false, looks, audio }).audio).toBe(audio);
  });

  it('passes reduced motion on to the scenes', () => {
    expect(createPreviewServices(resources, { reducedMotion: true, looks }).settings).toEqual({ reducedMotion: true });
    expect(createPreviewServices(resources, { reducedMotion: false, looks }).settings).toEqual({
      reducedMotion: false,
    });
  });

  it('seeds every build alike, so a run replays exactly', () => {
    const firstDraw = (): number => createPreviewServices(resources, { reducedMotion: false, looks }).rng.next();
    expect(firstDraw()).toBe(firstDraw());
  });
});
