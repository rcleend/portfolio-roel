/**
 * The startup gate's script, inlined into index.html's head ahead of the stylesheet (scripts/gatePlugin.ts): before
 * anything is painted or fetched it asks whether a graphics chip will draw the room (gate.ts has the rule) and says
 * so on the root element. With one, it asks for the site's modules right away, which the page's last script then
 * imports; without, `data-page="cv"` keeps the startup still from being drawn and that script imports the résumé
 * instead, so nothing of the room or the game is requested (docs/ROOM.md › No GPU).
 *
 * Nothing is remembered between visits: the question is asked again on every load, so a visitor who switches
 * hardware acceleration back on gets the room on the next one. Every byte of this is in the first response: no
 * imports beyond the rule.
 */
import { type AskContext, choosePage, type PageKind } from './gate';

const made: WebGLRenderingContext[] = [];
const ask: AskContext = (kind, strict) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext(
    kind,
    strict ? { failIfMajorPerformanceCaveat: true } : undefined,
  ) as WebGLRenderingContext | null;
  if (gl) made.push(gl);
  return gl;
};

let page: PageKind = 'site';
try {
  page = choosePage(location.search, ask);
} catch {
  // A browser that throws where it should answer is not evidence: the site.
}
// The contexts asked for are given back at once, so none counts against the room's own.
for (const gl of made) gl.getExtension('WEBGL_lose_context')?.loseContext();

if (page === 'cv') document.documentElement.dataset.page = 'cv';
else {
  // The site's entry and what it imports, as the build listed them: fetched from here on, run by the last script.
  for (const href of JSON.parse(document.currentScript?.dataset.site ?? '[]') as string[]) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.crossOrigin = '';
    link.href = href;
    document.head.append(link);
  }
}
