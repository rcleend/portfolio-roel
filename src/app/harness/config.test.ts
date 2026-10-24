import { describe, expect, it } from 'vitest';
import { HarnessConfigError, readHarnessConfig } from './config';

describe('readHarnessConfig', () => {
  it('reads every parameter in development', () => {
    const search = '?host=flat&scene=level&params={"levelId":"luna"}&seed=7&frames=120&looks={"customer":"hibit"}';
    expect(readHarnessConfig(search, true)).toEqual({
      enabled: true,
      host: 'flat',
      scene: 'level',
      params: { levelId: 'luna' },
      seed: 7,
      frames: 120,
      looks: { customer: 'hibit' },
    });
  });

  it('ignores harness parameters in production unless ?debug is set', () => {
    expect(readHarnessConfig('?scene=level&frames=3&host=flat&looks={"customer":"hibit"}', false)).toMatchObject({
      enabled: false,
      host: 'flat',
      scene: null,
      frames: null,
      looks: null,
    });
    expect(readHarnessConfig('?debug&scene=title', false)).toMatchObject({ enabled: true, scene: 'title' });
  });

  it('rejects unknown scenes, bad JSON and bad numbers', () => {
    expect(() => readHarnessConfig('?scene=nope', true)).toThrow(HarnessConfigError);
    expect(() => readHarnessConfig('?params={bad', true)).toThrow(/params must be JSON/);
    expect(() => readHarnessConfig('?frames=-1', true)).toThrow(/frames/);
    expect(() => readHarnessConfig('?seed=1.5', true)).toThrow(/seed/);
    expect(() => readHarnessConfig('?looks={"customer":"neon"}', true)).toThrow(
      new HarnessConfigError(
        'looks.customer must be one of classic, arcade, portrait, hibit, terraria, terraria-revised, terraria-hooded, got "neon"',
      ),
    );
  });
});
