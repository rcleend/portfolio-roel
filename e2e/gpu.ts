/**
 * Headless Chromium only gets a real WebGL context on this hardware through
 * ANGLE's Metal backend (the default SwiftShader path is slow and flaky for
 * the room's shaders). Set ROOM_GL=swiftshader to force software GL elsewhere.
 */
export const GPU_LAUNCH_ARGS =
  process.env.ROOM_GL === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
