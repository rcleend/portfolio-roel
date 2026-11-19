#!/usr/bin/env node
// What a visitor on the flat television reaches without a keyboard, found by trying: every visible thing on the page
// clicked (a mouse) or tapped (a finger), the page scrolled, and the game's own menus followed to its one link, with
// what each did (the résumé shown, a link opened, a track asked for).
//   node scripts/perf/nogpuReach.mjs --dist .shots/flights/nogpu/dist-fixed --label reach-mouse
//        [--args "--disable-gpu --enable-unsafe-swiftshader"] [--query '&host=flat'] [--device desktop|phone]
//        [--shots dir] [--out file.json] [--game-only]
//   --game-only  skips the page's own elements and the scroll: the game's menus alone.
// `--device phone` is a touch screen (taps and a swipe, no mouse). Links are caught, not followed: `window.open` is
// recorded and a navigation away from the page (the game's `mailto:`) is cancelled in the page's `navigate` event.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ensureDir, launch, serve, sleep } from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const dist = resolve(option('dist', 'dist'));
const label = option('label', 'reach');
const args = option('args', '--disable-gpu --enable-unsafe-swiftshader').split(' ').filter(Boolean);
const device = option('device', 'desktop');
const query = option('query', '&host=flat');
const shots = option('shots', null);
const out = option('out', null);
const touch = device === 'phone';

/** In the page before its scripts: every way out of the page is written down instead of taken. */
const CATCH = `(() => {
  const R = (window.__reach = { opened: [], navigations: [], plays: [], cancelled: 0 });
  window.open = (url) => { R.opened.push(String(url)); return null; };
  window.navigation?.addEventListener('navigate', (event) => {
    const url = event.destination.url;
    if (url.startsWith(location.origin)) return;
    R.navigations.push({ url, cancelable: event.cancelable, type: event.navigationType });
    if (event.cancelable) { event.preventDefault(); R.cancelled++; }
  });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...rest) { R.plays.push(this.currentSrc || this.src); return play.apply(this, rest); };
})();`;

const served = [];
const server = await serve(dist, served);
const base = `http://127.0.0.1:${server.address().port}`;
const { context, close } = await launch({ args, device });
const result = { label, args, device, query, touch, steps: [], shots: {} };
const log = (what, detail) => {
  result.steps.push({ what, ...detail });
  console.log(`  ${what}: ${JSON.stringify(detail)}`);
};
const watchdog = setTimeout(() => {
  console.log('  TIMED OUT after 150 s');
  process.exit(3);
}, 150_000);
try {
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  const popups = [];
  context.on('page', (opened) => popups.push(opened.url()));
  await page.addInitScript(CATCH);
  const shoot = async (name) => {
    if (!shots) return;
    ensureDir(shots);
    const file = join(shots, `${label}-${name}.png`);
    await page.screenshot({ path: file });
    const view = join(shots, `${label}-${name}-view.jpg`);
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1280', file, '--out', view], {
        stdio: 'ignore',
      });
    } catch {}
    result.shots[name] = view;
  };
  /** Where the visitor is: what a click or a tap may have changed. */
  const where = () =>
    page.evaluate(() => {
      const resume = document.getElementById('resume');
      const rect = resume?.getBoundingClientRect();
      const state = window.__arcade?.state();
      return {
        hash: location.hash,
        resumeShown: resume
          ? getComputedStyle(resume).clipPath !== 'inset(50%)' && rect.width > 10 && rect.top < innerHeight
          : null,
        scrollY: Math.round(scrollY),
        scene: state?.scene ?? null,
        paused: state?.paused ?? null,
        opened: window.__reach.opened.length,
        navigations: window.__reach.navigations.length,
        plays: window.__reach.plays.length,
        mediaElements: document.querySelectorAll('audio, video').length,
        focus: document.activeElement
          ? `${document.activeElement.tagName.toLowerCase()}.${String(document.activeElement.className).split(' ')[0]}`
          : null,
      };
    });
  const audioAsked = () => served.filter((entry) => /\/audio\//.test(entry.path)).length;
  // A press that lasts as a hand's does: the game reads its pointer once a step, and a tap that begins and ends
  // (and, for a finger, leaves) inside one step is no press to it. Playwright's own tap is that quick.
  const act = async (x, y) => {
    if (touch) {
      const point = { x: Math.round(x), y: Math.round(y), id: 1 };
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await sleep(90);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y, { delay: 70 });
  };
  const changed = (before, after) => {
    const diff = {};
    for (const key of Object.keys(after)) if (before[key] !== after[key]) diff[key] = `${before[key]} → ${after[key]}`;
    return diff;
  };

  await page.goto(`${base}/?debug${query}`, { waitUntil: 'commit' });
  const from = Date.now();
  let state = null;
  while (Date.now() - from < 60_000) {
    state = await page.evaluate(() => ({
      host: document.querySelector('[data-host]')?.getAttribute('data-host') ?? null,
      phase: document.getElementById('game')?.dataset.phase ?? null,
      lit: Boolean(document.querySelector('.flat-host')) && !document.querySelector('.tv__tube'),
      scene: window.__arcade?.state().scene ?? null,
    }));
    if (state.phase === 'running' && state.lit && state.scene === 'title') break;
    await sleep(100);
  }
  log('loaded', { ...state, afterMs: Date.now() - from });
  if (state.host !== 'flat') throw new Error(`The page shows the ${state.host} host`);
  await sleep(800);
  await shoot('start');

  // 1. Everything on the page a pointer can land on: the element on top at each point of a grid, each one once.
  const targets = await page.evaluate(() => {
    const found = new Map();
    const columns = 36;
    const rows = 24;
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const x = Math.round(((column + 0.5) / columns) * innerWidth);
        const y = Math.round(((row + 0.5) / rows) * innerHeight);
        const element = document.elementFromPoint(x, y);
        if (!element) continue;
        const key = `${element.tagName.toLowerCase()}.${String(element.className?.baseVal ?? element.className).split(' ')[0]}`;
        const entry = found.get(key) ?? {
          key,
          points: 0,
          x,
          y,
          text: (element.getAttribute('aria-label') ?? element.textContent ?? '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 70),
          cursor: getComputedStyle(element).cursor.slice(0, 40),
          inScreen: Boolean(element.closest('.tv__screen')),
          control: Boolean(element.closest('a[href], button, input, select, [role="button"]')),
        };
        entry.points++;
        found.set(key, entry);
      }
    return [...found.values()];
  });
  result.targets = targets;
  console.log(
    `  on top somewhere on the page: ${targets.map((t) => `${t.key}×${t.points}${t.control ? ' [control]' : ''}`).join(', ')}`,
  );
  // Everything the document holds that could be acted on, and whether a pointer can get to it.
  result.controls = await page.evaluate(() =>
    [...document.querySelectorAll('a[href], button, input, select, audio, video, [tabindex]')].map((element) => {
      const rect = element.getBoundingClientRect();
      let hidden = false;
      for (let node = element; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0 || s.clipPath === 'inset(50%)')
          hidden = true;
      }
      const inView = rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight;
      const top = inView ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
      return {
        what: `${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)}"${element.getAttribute('href') ? ` → ${element.getAttribute('href')}` : ''}`,
        pointerCanReach: inView && !hidden && Boolean(top && (top === element || element.contains(top))),
        inResume: Boolean(element.closest('#resume')),
      };
    }),
  );
  console.log(
    `  controls a pointer can reach: ${JSON.stringify(result.controls.filter((c) => c.pointerCanReach).map((c) => c.what))}`,
  );
  console.log(
    `  controls it cannot (${result.controls.filter((c) => !c.pointerCanReach).length}): ${JSON.stringify(result.controls.filter((c) => !c.pointerCanReach).map((c) => c.what))}`,
  );

  // 2. Each of them outside the game's screen, clicked or tapped once.
  const gameOnly = argv.includes('--game-only');
  for (const target of gameOnly ? [] : targets.filter((entry) => !entry.inScreen)) {
    const before = await where();
    const asked = audioAsked();
    await act(target.x, target.y);
    await sleep(350);
    const after = await where();
    log(`${touch ? 'tap' : 'click'} ${target.key} "${target.text.slice(0, 40)}" at ${target.x},${target.y}`, {
      changed: changed(before, after),
      audioAsked: audioAsked() - asked,
    });
    // The sound toggle is put back as it was.
    if (/sound-toggle/.test(target.key)) await act(target.x, target.y);
  }
  // A double click and a secondary click on the set's panel and the hint (a mouse's other gestures).
  if (!touch && !gameOnly) {
    for (const target of targets.filter((entry) => /tv__|flat-host/.test(entry.key) && !entry.inScreen)) {
      const before = await where();
      await page.mouse.dblclick(target.x, target.y);
      await page.mouse.click(target.x, target.y, { button: 'right' });
      await sleep(250);
      log(`double and secondary click ${target.key}`, { changed: changed(before, await where()) });
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // 3. Scrolling: a wheel, or a finger's swipe up the page.
  if (!gameOnly) {
    const before = await where();
    const size = await page.evaluate(() => ({
      scrollHeight: document.scrollingElement.scrollHeight,
      innerHeight,
      overflow: `${getComputedStyle(document.documentElement).overflow} / ${getComputedStyle(document.body).overflow}`,
    }));
    const viewport = page.viewportSize();
    if (touch) {
      await client.send('Input.synthesizeScrollGesture', {
        x: Math.round(viewport.width / 2),
        y: Math.round(viewport.height * 0.9),
        yDistance: -Math.round(viewport.height * 0.7),
        gestureSourceType: 'touch',
        speed: 1600,
      });
    } else {
      await page.mouse.move(viewport.width / 2, viewport.height - 30);
      await page.mouse.wheel(0, 2400);
    }
    await sleep(600);
    log(touch ? 'swipe up the page' : 'wheel down the page', { ...size, changed: changed(before, await where()) });
    await page.evaluate(() => scrollTo(0, 0));
  }

  // 4. The game itself: the title, the character, the missions, and the card that is not a mission (its link).
  const screen = await page.evaluate(() => {
    const rect = document.querySelector('.tv__canvas').getBoundingClientRect();
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  });
  const at = (u, v) => [screen.x + screen.w * u, screen.y + screen.h * v];
  const scene = async () => (await where()).scene;
  const until = async (test, ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (await test()) return true;
      await sleep(100);
    }
    return false;
  };
  await act(...at(0.5, 0.5));
  await until(async () => (await scene()) !== 'title', 5000);
  log(`${touch ? 'tap' : 'click'} the title`, await where());
  await sleep(1200);
  if (touch) {
    result.pad = await page.evaluate(() =>
      [...document.querySelectorAll('.touchpad [data-control]')].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          control: element.getAttribute('data-control'),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          visible: element.closest('.touchpad')?.getAttribute('data-visible'),
        };
      }),
    );
    console.log(`  touch pad: ${JSON.stringify(result.pad)}`);
  }
  await shoot('character-select');
  if ((await scene()) === 'characterSelect') {
    // A mouse: wherever the game shows its hand; a finger: the screen, then the pad's own buttons.
    const tries = [];
    if (!touch) {
      const hands = [];
      for (let row = 0; row < 9; row++)
        for (let column = 0; column < 16; column++) {
          const [x, y] = at((column + 0.5) / 16, (row + 0.5) / 9);
          await page.mouse.move(x, y);
          await sleep(45);
          const cursor = await page.evaluate(() => document.querySelector('.tv__screen').dataset.cursor);
          if (cursor === 'play') hands.push([x, y]);
        }
      console.log(`  character select: the hand shows at ${hands.length} of 144 points`);
      // From the top (the card is above the key hints), a few of them spread over where the hand shows.
      const spread = hands.filter((_, i) => i % Math.max(1, Math.floor(hands.length / 8)) === 0).slice(0, 8);
      for (const [x, y] of spread) tries.push([`where the hand shows (${Math.round(x)},${Math.round(y)})`, [x, y], 1]);
    }
    tries.push(['the middle of the screen', at(0.5, 0.5)]);
    for (const control of ['start', 'jump']) {
      const button = result.pad?.find((entry) => entry.control === control);
      if (button) tries.push([`the pad's ${control}`, [button.x, button.y]]);
    }
    for (const [name, [x, y], presses = 2] of tries) {
      for (let press = 0; press < presses && (await scene()) === 'characterSelect'; press++) {
        await act(x, y);
        await until(async () => (await scene()) !== 'characterSelect', 2600);
      }
      log(`character select, ${touch ? 'tapping' : 'clicking'} ${name}`, { scene: await scene() });
      if ((await scene()) === 'title') {
        // A press on the way back: begin again and go on with the next.
        await act(...at(0.5, 0.5));
        await until(async () => (await scene()) === 'characterSelect', 4000);
        await sleep(800);
        continue;
      }
      if ((await scene()) !== 'characterSelect') break;
    }
  }
  await sleep(1500);
  await shoot('level-select');
  if ((await scene()) === 'levelSelect') {
    // From the right, a row at a time: the card that is not a mission is the last. A hover or a first tap picks a
    // card, the next press on it acts.
    let done = null;
    let pressed = 0;
    const beforeAll = await where();
    outer: for (const v of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      for (let column = 23; column >= 0; column--) {
        const [x, y] = at((column + 0.5) / 24, v);
        if (!touch) {
          await page.mouse.move(x, y);
          await sleep(60);
          const cursor = await page.evaluate(() => document.querySelector('.tv__screen').dataset.cursor);
          if (cursor !== 'play') continue;
        }
        await act(x, y);
        pressed++;
        await sleep(350);
        const now = await where();
        if (now.navigations > beforeAll.navigations || now.opened > beforeAll.opened) {
          done = { at: [Math.round(x), Math.round(y)], column, v };
          break outer;
        }
        if (now.scene !== 'levelSelect') {
          done = { leftFor: now.scene, column, v };
          break outer;
        }
      }
    }
    // A mission chosen leaves a moment later.
    await sleep(2500);
    const links = await page.evaluate(() => ({ ...window.__reach }));
    log('mission select, pressing from the right', { pressed, done, sceneAfter: await scene(), links, popups });
    // A finger's lift takes the pointer off the screen, so a tap picks a card and cannot act on it: the pad acts.
    // The last card (the one that is not a mission) picked by a tap, then the pad's confirm.
    if (touch && !done && (await scene()) === 'levelSelect') {
      const before = await where();
      await act(...at(22.5 / 24, 0.4));
      await sleep(500);
      const tried = [];
      for (const control of ['jump', 'start']) {
        const button = result.pad?.find((entry) => entry.control === control);
        if (!button) continue;
        await act(button.x, button.y);
        await sleep(900);
        const now = await where();
        tried.push({ control, scene: now.scene, navigations: now.navigations, opened: now.opened });
        if (now.navigations > before.navigations || now.opened > before.opened || now.scene !== 'levelSelect') break;
      }
      log('mission select, a tap on the last card and then the pad', {
        tried,
        links: await page.evaluate(() => ({ ...window.__reach })),
      });
    }
    await shoot('level-select-after');
  }
  result.end = await where();
  result.links = await page.evaluate(() => ({ ...window.__reach }));
  result.audioFilesAsked = served.filter((entry) => /\/audio\//.test(entry.path)).map((entry) => entry.path);
  result.popups = popups;
  console.log(`  at the end: ${JSON.stringify(result.end)}`);
  console.log(`  links caught: ${JSON.stringify(result.links)}; tabs opened: ${JSON.stringify(popups)}`);
  console.log(`  audio files asked of the server: ${JSON.stringify(result.audioFilesAsked)}`);
} catch (error) {
  result.error = String(error);
  console.log(`  ERROR ${error}`);
} finally {
  clearTimeout(watchdog);
  await close();
  server.close();
}
if (out) {
  ensureDir(dirname(resolve(out)));
  writeFileSync(resolve(out), `${JSON.stringify(result, null, 1)}\n`);
}
