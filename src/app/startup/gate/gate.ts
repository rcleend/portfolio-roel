import { isSoftwareGpu } from '@/room/stage/softwareGpu';

/** What the page becomes: the room with the game, or the résumé alone (docs/ROOM.md › No GPU). */
export type PageKind = 'site' | 'cv';

type Gl = Parameters<typeof isSoftwareGpu>[0];

/** Asks the browser for a WebGL context; `strict` is `failIfMajorPerformanceCaveat`. Null when it gives none. */
export type AskContext = (kind: 'webgl2' | 'webgl', strict: boolean) => Gl | null;

/**
 * The startup gate's rule. A visitor is sent to the résumé only on positive evidence that no graphics chip will draw
 * the room: the browser gives no WebGL context at all, or the context it gives names a software renderer. Everything
 * else is the site, a browser that refuses the strict request but will not say what draws the plain one included.
 *
 * - `?host=cv` is the résumé whatever the machine; `?host=room` and `?host=flat` are the site, unasked.
 * - The strict WebGL 2 request is the one a visitor with a GPU pays for (one context). Chrome refuses it on its
 *   software renderer, so the plain requests after it are made only where something is already unusual: a browser
 *   with WebGL 1 alone, software rendering, or no WebGL.
 * - A software renderer that is handed over as if it were a GPU (`--use-angle=swiftshader`, some Linux setups) is
 *   told by its name alone, which is why the name is read even when the strict request is granted.
 */
export function choosePage(search: string, ask: AskContext): PageKind {
  const host = new URLSearchParams(search).get('host');
  if (host === 'cv') return 'cv';
  if (host === 'room' || host === 'flat') return 'site';
  const gl = ask('webgl2', true) ?? ask('webgl', true) ?? ask('webgl2', false) ?? ask('webgl', false);
  return gl === null || isSoftwareGpu(gl) ? 'cv' : 'site';
}
