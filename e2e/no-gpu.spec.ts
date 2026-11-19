import { type BrowserContextOptions, expect, type LaunchOptions, type Page, test } from '@playwright/test';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, trackErrors, waitForRunning } from './helpers';

/**
 * A visitor whose browser has no GPU to draw the room with gets the résumé and nothing else (docs/ROOM.md › No GPU):
 * the startup gate decides in the page's head, so the startup still is never drawn and nothing of the room or the
 * game is asked for. Each launch here is one way to be without a GPU that this machine can stage.
 */

/** Playwright adds this to every macOS Chromium launch; without it `--disable-gpu` is what a visitor's switch does. */
const NO_FALLBACK = { ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] };

const NO_GPU = {
  // The e2e suite's own software launch (ROOM_GL=swiftshader): handed over as a GPU, told by the renderer's name.
  'software WebGL handed over as a GPU': {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  // Chrome's fallback where it still falls back: the strict request is refused, the plain one names SwiftShader.
  'software WebGL as a fallback': { args: ['--disable-gpu', '--enable-unsafe-swiftshader'] },
  // Hardware acceleration switched off in Chrome's settings.
  'hardware acceleration off': { args: ['--disable-gpu'], ...NO_FALLBACK },
  'WebGL unavailable': { args: ['--disable-webgl', '--disable-3d-apis'], ...NO_FALLBACK },
} as const;

test.skip(process.env.ROOM_GL === 'swiftshader', 'the software-GL run of the suite is served without the gate');

// The tests that need a GPU, or do not care, share this launch; each way of being without one launches its own browser.
test.use({ launchOptions: { args: [...GPU_LAUNCH_ARGS] } });

type Launcher = {
  chromium: { launch(options: LaunchOptions): ReturnType<typeof import('@playwright/test').chromium.launch> };
};

/** Runs `visit` on a page of a browser launched this way, at the suite's address. */
async function inBrowser(
  playwright: Launcher,
  launch: LaunchOptions,
  visit: (page: Page) => Promise<void>,
  context: BrowserContextOptions = {},
): Promise<void> {
  const browser = await playwright.chromium.launch(launch);
  try {
    await visit(await browser.newPage({ baseURL: test.info().project.use.baseURL, ...context }));
  } finally {
    await browser.close();
  }
}

/** The paper's colour (resume/Resume.css › --paper). */
const PAPER = 'rgb(247, 243, 230)';

interface Watch {
  /** The startup still was drawn into, or stood where it could be painted. */
  __still: boolean;
  /** The root's background at each of the page's first frames. */
  __backgrounds: string[];
  __contextsLost: number;
}

/** Watches the startup still from before the page's first byte is parsed, and the root's colour frame by frame. */
async function watch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = window as unknown as Watch;
    state.__still = false;
    state.__backgrounds = [];
    state.__contextsLost = 0;
    const look = (): void => {
      const still = document.getElementById('tv-still');
      if (still && (still.children.length > 0 || getComputedStyle(still).display !== 'none')) state.__still = true;
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true });
    const frame = (): void => {
      look();
      if (document.documentElement && state.__backgrounds.length < 30)
        state.__backgrounds.push(getComputedStyle(document.documentElement).backgroundColor);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    addEventListener('webglcontextlost', () => state.__contextsLost++, true);
  });
}

/** Every address the page asks for, as paths (other origins with their host). */
function requests(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    asked.push(
      url.host === new URL(test.info().project.use.baseURL ?? '').host ? url.pathname : url.host + url.pathname,
    );
  });
  return asked;
}

/** What the résumé page may ask the dev server for: itself, its script, its styles, its face and the page's cursors. */
const CV_REQUESTS = [
  /^\/$/,
  /^\/@vite\/client$/,
  /^\/@react-refresh$/,
  /\/node_modules\/vite\/dist\/client\//,
  /^\/src\/app\/cv\/main\.ts$/,
  /^\/@id\/__x00__virtual:cv$/,
  /^\/node_modules\/\.vite\/deps\/@vercel_analytics\.js/,
  /^\/src\/app\/styles\.css$/,
  /^\/src\/app\/resume\/Resume\.css$/,
  /^\/src\/app\/cursors\/(cursors\.css|arrow(@2x)?\.png|hand(@2x)?\.png)$/,
  /\/@fontsource\/silkscreen\//,
  /^va\.vercel-scripts\.com\//,
  /^\/favicon\.svg$/,
  /^\/CREDITS\.txt$/,
];

async function openCv(page: Page, path = '/'): Promise<{ asked: string[]; errors: string[] }> {
  const errors = trackErrors(page);
  const asked = requests(page);
  await watch(page);
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-cv', 'shown');
  return { asked, errors };
}

/** The résumé is the page, and nothing of the room or the game was drawn or asked for. */
async function expectCvAlone(page: Page, asked: string[]): Promise<void> {
  const resume = page.getByRole('main');
  await expect(resume).toBeVisible();
  await expect(resume.getByRole('heading', { level: 1 })).toHaveText('Roel Leenders');
  await expect(page).toHaveTitle(/Roel Leenders.*Résumé/);
  // Let anything the page would still ask for be asked.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => {
    const state = window as unknown as Watch;
    return {
      still: state.__still,
      backgrounds: [...new Set(state.__backgrounds)],
      canvases: document.querySelectorAll('canvas').length,
      host: document.querySelector('[data-host]') !== null,
      game: document.getElementById('game') !== null,
      workers: performance.getEntriesByType('resource').filter((entry) => /worker/i.test(entry.name)).length,
    };
  });
  // The TV's picture never stood on the page: not drawn, not displayed, the root the paper's colour in every frame.
  expect(seen.still).toBe(false);
  expect(seen.backgrounds).toEqual([PAPER]);
  expect(seen).toMatchObject({ canvases: 0, host: false, game: false, workers: 0 });
  // No room, no game, no engine, no React, no still: only the résumé's own files.
  const foreign = asked.filter((path) => !CV_REQUESTS.some((allowed) => allowed.test(path)));
  expect(foreign).toEqual([]);
  expect(
    asked.filter((path) => /\/src\/(room|game|engine)\/|three|react-dom|\/startup\/|main\.tsx|\/hosts\//.test(path)),
  ).toEqual([]);
  // Nothing on it offers a game or a room that is not there.
  await expect(page.locator('.skip-link')).toHaveCount(0);
  await expect(page.getByText(/back to the game/i)).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);
}

for (const [name, launch] of Object.entries(NO_GPU)) {
  test(`${name}: the résumé is the page, and nothing of the room or the game is drawn or fetched`, async ({
    playwright,
  }) => {
    await inBrowser(playwright, { ...launch, args: [...launch.args] }, async (page) => {
      const { asked, errors } = await openCv(page);
      await expectCvAlone(page, asked);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the résumé page', () => {
  // Forced on a machine with a GPU: the page is the same whatever sent the visitor there.
  test('?host=cv shows it on a machine with a GPU', async ({ page }) => {
    const { asked, errors } = await openCv(page, '/?host=cv');
    await expectCvAlone(page, asked);
    expect(errors).toEqual([]);
  });

  test('leads to everything the room leads to, and every link can be reached and followed', async ({ page }) => {
    await openCv(page, '/?host=cv');
    const links = page.getByRole('main').getByRole('link');
    const hrefs = await links.evaluateAll((all) => all.map((link) => (link as HTMLAnchorElement).getAttribute('href')));
    for (const href of [
      'mailto:rcleende@gmail.com',
      'https://www.linkedin.com/in/roel-leendersit',
      'https://github.com/rcleend',
      'https://x.com/LeendersRoel',
      'https://doi.org/10.3233/FAIA220213',
      '/CREDITS.txt',
    ]) {
      expect(hrefs).toContain(href);
    }
    // Each is on top where it stands, so a click or a tap lands on it.
    for (const link of await links.all()) {
      await link.scrollIntoViewIfNeeded();
      const onTop = await link.evaluate((anchor) => {
        const box = anchor.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit !== null && anchor.contains(hit);
      });
      expect(onTop, (await link.getAttribute('href')) ?? '').toBe(true);
    }
    // The keyboard reaches them in reading order, the e-mail address first.
    await page.evaluate(() => window.scrollTo(0, 0));
    const tabbed: (string | null)[] = [];
    for (let i = 0; i < hrefs.length; i++) {
      await page.keyboard.press('Tab');
      tabbed.push(await page.evaluate(() => document.activeElement?.getAttribute('href') ?? null));
    }
    expect(tabbed).toEqual(hrefs);
    // And one is followed: the credits, the page's own file.
    await page.getByRole('link', { name: 'Credits' }).click();
    await expect(page).toHaveURL(/\/CREDITS\.txt$/);
    expect((await page.request.get('/CREDITS.txt')).ok()).toBe(true);
  });

  test('scrolls with the wheel and the keyboard, and is one document with its headings in order', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCv(page, '/?host=cv');
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(bottom).toBeGreaterThan(500);
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 600);
    await expect.poll(scrollY).toBe(600);
    await page.keyboard.press('End');
    await expect.poll(scrollY).toBe(bottom);
    await page.keyboard.press('Home');
    await expect.poll(scrollY).toBe(0);
    await page.keyboard.press('Space');
    await expect.poll(scrollY).toBeGreaterThan(300);
    // Nothing is wider than the window.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const levels = await page
      .getByRole('heading')
      .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect((levels[i] ?? 0) - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.dataset.pointer)).toBeUndefined();
  });

  test('moves nothing, with reduced motion or without', async ({ page }) => {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      await page.emulateMedia({ reducedMotion });
      await page.goto('/?host=cv');
      await expect(page.locator('html')).toHaveAttribute('data-cv', 'shown');
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    }
  });

  test('remembers nothing: the next visit is asked again', async ({ page }) => {
    await openCv(page, '/?host=cv');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([
      0,
      0,
      '',
    ]);
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await expect(hostElement(page)).toHaveAttribute('data-host', 'room');
    expect(await page.evaluate(() => document.documentElement.dataset.page)).toBeUndefined();
  });
});

test('on a phone without a GPU the résumé scrolls under a finger, fits the screen, and a tap follows a link', async ({
  playwright,
}) => {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const visit = async (page: Page): Promise<void> => {
    const { asked } = await openCv(page);
    await expectCvAlone(page, asked);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.synthesizeScrollGesture', { x: 195, y: 600, yDistance: -500, gestureSourceType: 'touch' });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    const credits = page.getByRole('link', { name: 'Credits' });
    await credits.scrollIntoViewIfNeeded();
    await credits.tap();
    await expect(page).toHaveURL(/\/CREDITS\.txt$/);
  };
  await inBrowser(playwright, { args: ['--disable-gpu'], ...NO_FALLBACK }, visit, phone);
});

test.describe('a visitor with a GPU', () => {
  test('gets the room as before: the still from the first frame, no résumé script, no context lost', async ({
    page,
  }) => {
    const asked = requests(page);
    await watch(page);
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await expect(hostElement(page)).toHaveAttribute('data-host', 'room');
    await expect(hostElement(page)).toHaveAttribute('data-ready', 'true');
    const seen = await page.evaluate(() => {
      const state = window as unknown as Watch;
      return { page: document.documentElement.dataset.page, still: state.__still, lost: state.__contextsLost };
    });
    // The watch that must stay false for the résumé's visitor is true here: it sees a still when there is one.
    expect(seen).toEqual({ page: undefined, still: true, lost: 0 });
    expect(asked.filter((path) => /\/cv\/|virtual:cv/.test(path))).toEqual([]);
  });
});
