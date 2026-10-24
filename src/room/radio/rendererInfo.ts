/** Renderers that rasterise on the CPU: every pixel is expensive there, so the radio spares them its extras. */
export const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

/** The GPU's name when the browser exposes it (`WEBGL_debug_renderer_info`), else null. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (!info) return null;
  const name: unknown = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  return typeof name === 'string' ? name : null;
}

/** True when the named renderer is a software one; an unknown renderer is not. */
export function isSoftwareRenderer(name: string | null): boolean {
  return name !== null && SOFTWARE_RENDERER.test(name);
}

/** `navigator.deviceMemory` (GB, coarse, Chromium only), or undefined. */
export function deviceMemory(): number | undefined {
  return (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
}

/** The visitor asked for reduced data use (`Save-Data`). */
export function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
