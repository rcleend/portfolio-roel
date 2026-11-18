import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build, createServer, type Plugin, type ResolvedConfig, type ViteDevServer } from 'vite';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const GATE = `${SRC}/app/startup/gate/inline.ts`;
/** The site's entry and the résumé page's, as index.html and the dev server name them. */
const SITE_ENTRY = '/src/app/main.tsx';
const CV_ENTRY = '/src/app/cv/main.ts';
const CV_RENDER = '/src/app/cv/render.tsx';
const VIRTUAL = 'virtual:cv';
const alias = { '@': SRC };

/** Only the page with the startup still is gated: the labs' pages load what they name. */
const GATED = /<div id="tv-still"/;
const MODULE_SCRIPT = /\s*<script type="module"(?: crossorigin)? src="([^"]+)"><\/script>/g;
const MODULE_PRELOAD = /\s*<link rel="modulepreload"(?: crossorigin)? href="([^"]+)"\s*\/?>/g;

/**
 * What a visitor sent to the résumé is shown before its script arrives: the paper's colour (resume/Resume.css ›
 * `--paper`), and no startup still. In the page itself rather than the stylesheet, so it holds from the first paint
 * wherever the styles come from (the dev server hands them over in scripts).
 */
const CV_FIRST_PAINT =
  'html[data-page=cv]{background:#f7f3e6;color-scheme:light}html[data-page=cv] .tv-still{display:none}';

interface Chunk {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
  readonly isEntry?: boolean;
}

function outputs(result: unknown): Chunk[] {
  const first = (Array.isArray(result) ? result[0] : result) as { output?: Chunk[] } | undefined;
  return first?.output ?? [];
}

/** The startup gate's script (src/app/startup/gate/inline.ts with its rule), minified. */
export async function gateScript(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias },
    build: { write: false, minify: true, target: 'es2020', lib: { entry: GATE, formats: ['iife'], name: 'gate' } },
  });
  const code = outputs(result)[0]?.code;
  if (!code) throw new Error('The startup gate’s script did not build');
  if (code.includes('</script')) throw new Error('The startup gate’s script would end its own element');
  return code.trim();
}

/** The résumé page as `virtual:cv` exports it: app/cv/render.tsx run in Node, by this server or one made for it. */
async function renderCv(server: ViteDevServer | null): Promise<string> {
  const own = server
    ? null
    : await createServer({
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, watch: null, ws: false },
        optimizeDeps: { noDiscovery: true },
      });
  try {
    const module = (await (server ?? own)?.ssrLoadModule(CV_RENDER)) as { cv: { html: string; title: string } };
    return `export const html = ${JSON.stringify(module.cv.html)};\nexport const title = ${JSON.stringify(module.cv.title)};\n`;
  } finally {
    await own?.close();
  }
}

/** Resolves `virtual:cv` (src/app/cv/virtual.d.ts) to the rendered résumé. */
function cvMarkup(server: () => ViteDevServer | null): Plugin {
  return {
    name: 'cv-markup',
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : null),
    load: (id) => (id === `\0${VIRTUAL}` ? renderCv(server()) : null),
  };
}

/**
 * The résumé page's script (src/app/cv/main.ts) as one file of its own, built apart from the site so that nothing is
 * shared between the two and the site's chunks stay what they were. Its styles are left out: they are the site's too.
 */
export async function cvScript(base: string): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    base,
    resolve: { alias },
    plugins: [cvMarkup(() => null)],
    build: { write: false, minify: true, target: 'es2020', rollupOptions: { input: `${SRC}/app/cv/main.ts` } },
  });
  const scripts = outputs(result).filter((file) => file.type === 'chunk');
  const code = scripts[0]?.code;
  if (scripts.length !== 1 || !code) throw new Error('The résumé page must build to one script');
  return code;
}

/**
 * The startup gate (docs/ROOM.md › No GPU): decides in index.html's head, before anything is painted or fetched,
 * whether this visitor gets the site or, having no GPU to draw the room with, the résumé alone.
 *
 * - The gate's script goes into the head ahead of the stylesheet and behind a preload of it, so it runs while the
 *   stylesheet is on its way.
 * - The site's entry and its module preloads leave the markup, where the browser would fetch them unasked, for a
 *   list the gate preloads from once it knows; the page's last script imports the entry, or the résumé's.
 * - The résumé page is built to a script of its own and rendered to markup here.
 */
export function gatePlugin(): Plugin {
  let config: ResolvedConfig;
  let server: ViteDevServer | null = null;
  /** The résumé page's script in the build's output, once emitted. */
  let cvFile: string | null = null;
  const markup = cvMarkup(() => server);
  return {
    name: 'startup-gate',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(dev) {
      server = dev;
    },
    resolveId: markup.resolveId,
    load: markup.load,
    async buildStart() {
      if (config.command !== 'build' || config.build.ssr) return;
      const source = await cvScript(config.base);
      const hash = createHash('sha256').update(source).digest('base64url').slice(0, 8);
      cvFile = `${config.build.assetsDir}/cv-${hash}.js`;
      this.emitFile({ type: 'asset', fileName: cvFile, source });
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        if (!GATED.test(html)) return html;
        // The e2e suite's software-GL run (ROOM_GL=swiftshader, e2e/gpu.ts) is there to test the room on a software
        // renderer, which the gate would turn away: its dev server serves the page ungated.
        if (!context.bundle && process.env.ROOM_GL === 'swiftshader') return html;
        const files = Object.values((context.bundle ?? {}) as Record<string, Chunk>);
        const entries = context.bundle
          ? files.filter((file) => file.type === 'chunk' && file.isEntry).map((file) => config.base + file.fileName)
          : [SITE_ENTRY];
        const site: string[] = [];
        let page = html.replace(MODULE_SCRIPT, (tag, src: string) => {
          if (!entries.includes(src)) return tag;
          site.unshift(src);
          return '';
        });
        page = page.replace(MODULE_PRELOAD, (_tag, href: string) => {
          site.push(href);
          return '';
        });
        const [entry] = site;
        if (!entry || site.some((address) => /['<]/.test(address))) throw new Error('index.html has no entry to gate');
        if (context.bundle) {
          // The résumé page ships without styles of its own (cvScript): the page's stylesheet must hold them.
          const styled = files.some(
            (file) => file.fileName.endsWith('.css') && String(file.source).includes('.resume--page'),
          );
          if (!cvFile || !styled) throw new Error('The résumé page’s script or its styles are missing from the build');
        }
        const cv = cvFile ? config.base + cvFile : CV_ENTRY;
        const gate = `<script data-site='${JSON.stringify(site)}'>${await gateScript()}</script><style>${CV_FIRST_PAINT}</style>`;
        const load = `<script type="module">import(document.documentElement.dataset.page?${JSON.stringify(cv)}:${JSON.stringify(entry)})</script>`;
        // The stylesheet is asked for before the gate runs (a preload, which holds no script back), so the gate's
        // question is answered while it is on its way; its own tag follows the gate and takes what the preload fetched.
        const sheets = [...page.matchAll(/<link rel="stylesheet"( crossorigin)? href="([^"]+)"\s*\/?>/g)];
        const ahead = sheets
          .map(([, cors = '', href]) => `<link rel="preload" as="style"${cors} href="${href}">`)
          .join('');
        const before = sheets[0]?.[0] ?? '</head>';
        return page
          .replace(before, (found) => `${ahead}${gate}\n${found}`)
          .replace('</body>', () => `${load}\n</body>`);
      },
    },
  };
}
