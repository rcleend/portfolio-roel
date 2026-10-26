import { describe, expect, it } from 'vitest';
import { isSoftwareGpu } from './softwareGpu';

const RENDERER = 0x1f01;
const UNMASKED_RENDERER_WEBGL = 0x9246;

function fakeGl(renderers: { readonly unmasked?: string; readonly masked: string }) {
  return {
    RENDERER,
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' && renderers.unmasked !== undefined ? { UNMASKED_RENDERER_WEBGL } : null,
    getParameter: (parameter: number) =>
      parameter === UNMASKED_RENDERER_WEBGL ? renderers.unmasked : renderers.masked,
  } as unknown as Parameters<typeof isSoftwareGpu>[0];
}

describe('isSoftwareGpu', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Microsoft Basic Render Driver',
  ])('knows %s for a software GPU', (unmasked) => {
    expect(isSoftwareGpu(fakeGl({ unmasked, masked: 'WebKit WebGL' }))).toBe(true);
  });

  it.each(['ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)', 'Adreno (TM) 610', 'Mali-G52'])(
    'takes %s for a real one',
    (unmasked) => {
      expect(isSoftwareGpu(fakeGl({ unmasked, masked: 'WebKit WebGL' }))).toBe(false);
    },
  );

  it('reads the plain renderer name where the unmasked one is not offered', () => {
    expect(isSoftwareGpu(fakeGl({ masked: 'llvmpipe' }))).toBe(true);
    expect(isSoftwareGpu(fakeGl({ masked: 'Apple GPU' }))).toBe(false);
  });
});
