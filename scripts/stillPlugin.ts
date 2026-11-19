import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';

const ENTRY = fileURLToPath(new URL('../src/app/startup/still/inline.ts', import.meta.url));
/** The still's element in index.html, whole: the script goes right after it, so it runs before the first paint. */
const STILL = /<div id="tv-still"[^>]*><\/div>/;

/** The startup still's script (src/app/startup/still/inline.ts with its camera, its drawing and its data), minified. */
export async function stillScript(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      target: 'es2020',
      lib: { entry: ENTRY, formats: ['iife'], name: 'still' },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result) as { output: { code?: string }[] } | undefined;
  const code = output?.output[0]?.code;
  if (!code) throw new Error('The startup still’s script did not build');
  if (code.includes('</script')) throw new Error('The startup still’s script would end its own element');
  return code.trim();
}

/**
 * Inlines the startup still's script into index.html (docs/ROOM.md › Startup), in development and in the build: the
 * still is the page's first picture, so what draws it is in the first response and runs where it stands.
 */
export function stillPlugin(): Plugin {
  return {
    name: 'startup-still',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        // The labs' pages have no still.
        if (!STILL.test(html)) return html;
        const script = await stillScript();
        // The first response carries no indentation: the page reads the same, some eighty bytes lighter on the wire.
        // A visitor the startup gate sent to the résumé has no still (scripts/gatePlugin.ts): nothing drawn, nothing fetched.
        const guarded = `if(!document.documentElement.dataset.page){${script}}`;
        return html.replace(/\n\s+/g, '\n').replace(STILL, (element) => `${element}<script>${guarded}</script>`);
      },
    },
  };
}
