/** Renderer names of GPUs that are software (the CPU drawing for one): Chrome's SwiftShader, Mesa's llvmpipe… */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Whether the page draws with a software GPU. There, a 2D canvas the browser accelerates queues its
 * raster behind the room's frames on that same CPU (painting the computer's wallpaper took the game
 * 1.1 s the first time under SwiftShader), while a CPU canvas paints on the main thread in 7 ms.
 */
export function isSoftwareGpu(gl: Pick<WebGLRenderingContext, 'getExtension' | 'getParameter' | 'RENDERER'>): boolean {
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return typeof renderer === 'string' && SOFTWARE_RENDERER.test(renderer);
}
