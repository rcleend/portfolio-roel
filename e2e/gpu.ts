/**
 * Headless Chromium only gets a real WebGL context on this hardware through
 * ANGLE's Metal backend (the default SwiftShader path is slow and flaky for
 * the room's shaders). Set ROOM_GL=swiftshader to force software GL elsewhere.
 * A visitor on software GL gets the résumé, not the room (docs/ROOM.md › No GPU), so with ROOM_GL=swiftshader the
 * dev server leaves the startup gate out of the page (scripts/gatePlugin.ts) and the suite still drives the room.
 */
export const GPU_LAUNCH_ARGS =
  process.env.ROOM_GL === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
