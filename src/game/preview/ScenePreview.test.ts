import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AssetStore } from '@/engine/assets/AssetStore';
import { NullAudio } from '@/engine/audio/NullAudio';
import { nullContext } from '@/engine/core/testing';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import type { Sprites } from '../art';
import { arcadeFont } from '../art/fonts/arcade';
import { smallFont } from '../art/fonts/small';
import type { MusicId, SfxId } from '../audio/ids';
import { createTextStyles } from '../fonts';
import type { LevelArtLibrary } from '../levels/art/LevelArt';
import type { GameResources } from '../resources';
import { TITLE_TIMES } from '../scenes/title/titleTimeline';
import type { PreviewSpec } from './PreviewDirector';
import { ScenePreview } from './ScenePreview';

const TITLE: PreviewSpec = { scene: 'title', params: { lockup: 'classic', backdrop: 'classic' } };
/** Frames into the intro: settled, and inside the white flash just before. */
const SETTLED = Math.ceil(TITLE_TIMES.settled * 60);
const FLASHING = SETTLED - 6;

function testResources(): GameResources {
  const small = BitmapFont.fromGlyphData(smallFont);
  const fonts = { small, label: small, arcade: BitmapFont.fromGlyphData(arcadeFont) };
  return {
    assets: {} as AssetStore,
    fonts,
    text: createTextStyles(fonts),
    sprites: {} as Sprites,
    levelArt: {} as LevelArtLibrary,
  };
}

/** A screen that remembers every call and property write, so two renders can be compared. */
function recordingScreen() {
  let calls: unknown[][] = [];
  let alpha = 1;
  const saved: number[] = [];
  const state: Record<string | symbol, unknown> = { canvas: { width: 320, height: 240 } };
  const context = new Proxy(state, {
    get: (target, key) => {
      if (key === 'globalAlpha') return alpha;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'save') saved.push(alpha);
        if (key === 'restore') alpha = saved.pop() ?? alpha;
      };
    },
    set: (target, key, value) => {
      calls.push([key, '=', value]);
      if (key === 'globalAlpha') alpha = value as number;
      else target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  /** The calls one render of `preview` makes. */
  const draw = (preview: ScenePreview): unknown[][] => {
    calls = [];
    preview.render();
    return calls;
  };
  return { context, draw };
}

/** Whether a render whites out the whole screen, as the title's flash does. */
function whitesOut(calls: readonly unknown[][]): boolean {
  return calls.some(
    (call, index) =>
      call[0] === 'fillStyle' &&
      call[2] === '#ffffff' &&
      JSON.stringify(calls[index + 1]) === JSON.stringify(['fillRect', 0, 0, 320, 240]),
  );
}

// Previews paint into canvases; without a DOM these take the pixels and keep none.
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => nullContext() }) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('ScenePreview', () => {
  const resources = testResources();

  it('shows a frame alike whether it played there or seeked back to it', () => {
    const screen = recordingScreen();
    const preview = new ScenePreview({ resources, spec: TITLE, reducedMotion: false, context: screen.context });
    preview.advanceTo(SETTLED + 40);
    const played = screen.draw(preview);
    preview.advanceTo(SETTLED + 200);
    const later = screen.draw(preview);

    preview.seek(SETTLED + 40);
    expect(preview.frame).toBe(SETTLED + 40);
    expect(screen.draw(preview)).toEqual(played);
    expect(later).not.toEqual(played);

    preview.seek(0);
    preview.seek(SETTLED + 40);
    expect(screen.draw(preview)).toEqual(played);
  });

  it('starts over at the opening hit when restarted', () => {
    const screen = recordingScreen();
    const preview = new ScenePreview({ resources, spec: TITLE, reducedMotion: false, context: screen.context });
    const opening = screen.draw(preview);
    preview.advanceTo(SETTLED);
    preview.restart();
    expect(preview.frame).toBe(0);
    expect(screen.draw(preview)).toEqual(opening);
  });

  it('enters quietly and keeps the effects it passes while seeking silent, its music playing', () => {
    const audio = new NullAudio<MusicId, SfxId>();
    const preview = new ScenePreview({ resources, spec: TITLE, reducedMotion: false, audio, context: nullContext() });
    expect(audio.currentMusic).toBe('title');
    preview.seek(SETTLED + 60);
    expect(audio.playedSfx).toEqual([]);
    expect(audio.currentMusic).toBe('title');
  });

  it('sounds the opening hit and every cue on the way when played', () => {
    const audio = new NullAudio<MusicId, SfxId>();
    const preview = new ScenePreview({ resources, spec: TITLE, reducedMotion: false, audio, context: nullContext() });
    preview.restart();
    preview.advanceTo(SETTLED + 60);
    expect(audio.playedSfx).toEqual(['explosion', 'flash']);
  });

  it('plays the scene under the reduced motion it was made with', () => {
    const flashes = (reducedMotion: boolean): boolean => {
      const screen = recordingScreen();
      const preview = new ScenePreview({ resources, spec: TITLE, reducedMotion, context: screen.context });
      preview.seek(FLASHING);
      return whitesOut(screen.draw(preview));
    };
    expect(flashes(false)).toBe(true);
    expect(flashes(true)).toBe(false);
  });

  it('takes no input, so the scene stays put through its attract loop', () => {
    const preview = new ScenePreview({ resources, spec: TITLE, reducedMotion: false, context: nullContext() });
    preview.advanceTo(SETTLED + 30 * 60);
    expect(preview.requests).toEqual([]);
  });
});
