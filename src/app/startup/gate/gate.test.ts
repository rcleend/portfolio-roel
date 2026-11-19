import { describe, expect, it, vi } from 'vitest';
import { type AskContext, choosePage } from './gate';

const RENDERER = 0x1f01;
const UNMASKED = 0x9246;
const METAL = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)';

/** A context whose renderer has this name, with or without the extension that unmasks it. */
function context(name: string, unmasked = true): NonNullable<ReturnType<AskContext>> {
  const fake = {
    RENDERER,
    getExtension: (extension: string) =>
      unmasked && extension === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : null,
    getParameter: (parameter: number) => (parameter === (unmasked ? UNMASKED : RENDERER) ? name : 'WebKit WebGL'),
  };
  return fake as unknown as NonNullable<ReturnType<AskContext>>;
}

/** A browser that answers each request from a table: `strict2`, `strict1`, `plain2`, `plain1`. */
function browser(answers: Partial<Record<'strict2' | 'strict1' | 'plain2' | 'plain1', ReturnType<typeof context>>>) {
  return vi.fn<AskContext>(
    (kind, strict) => answers[`${strict ? 'strict' : 'plain'}${kind === 'webgl2' ? 2 : 1}`] ?? null,
  );
}

describe('choosePage', () => {
  it('is the site on a GPU, for the price of one context', () => {
    const ask = browser({ strict2: context(METAL), strict1: context(METAL), plain2: context(METAL) });
    expect(choosePage('', ask)).toBe('site');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('is the résumé where the browser gives no WebGL at all', () => {
    const ask = browser({});
    expect(choosePage('', ask)).toBe('cv');
    expect(ask).toHaveBeenCalledTimes(4);
  });

  it('is the résumé where only a software renderer answers', () => {
    expect(choosePage('', browser({ plain2: context(SWIFTSHADER), plain1: context(SWIFTSHADER) }))).toBe('cv');
    expect(choosePage('?seed=1', browser({ plain1: context('llvmpipe (LLVM 15.0.7, 256 bits)') }))).toBe('cv');
  });

  it('tells a software renderer handed over as a GPU by its name', () => {
    expect(choosePage('', browser({ strict2: context(SWIFTSHADER) }))).toBe('cv');
    expect(choosePage('', browser({ strict2: context('Microsoft Basic Render Driver') }))).toBe('cv');
  });

  it('is the site on a GPU with WebGL 1 alone', () => {
    const ask = browser({ strict1: context('Adreno (TM) 330'), plain1: context('Adreno (TM) 330') });
    expect(choosePage('', ask)).toBe('site');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('is the site when the evidence is unclear: the strict request refused, the renderer not a known software one', () => {
    expect(choosePage('', browser({ plain2: context('Mozilla', false) }))).toBe('site');
    expect(choosePage('', browser({ plain1: context('Apple GPU') }))).toBe('site');
  });

  it('is the site when the renderer will not be named', () => {
    expect(choosePage('', browser({ strict2: context('WebKit WebGL', false) }))).toBe('site');
  });

  it('obeys ?host= without asking for a context', () => {
    const none = browser({});
    expect(choosePage('?host=room', none)).toBe('site');
    expect(choosePage('?host=flat&seed=1', none)).toBe('site');
    expect(none).not.toHaveBeenCalled();
    const gpu = browser({ strict2: context(METAL) });
    expect(choosePage('?host=cv', gpu)).toBe('cv');
    expect(gpu).not.toHaveBeenCalled();
  });

  it('asks all the same for a ?host= it does not know', () => {
    expect(choosePage('?host=attic', browser({}))).toBe('cv');
    expect(choosePage('?host=attic', browser({ strict2: context(METAL) }))).toBe('site');
  });
});
