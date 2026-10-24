import { expect, type Page, test } from '@playwright/test';
import type * as AssetsModule from '../src/engine/assets/AssetStore';
import type { SpriteSheet } from '../src/engine/gfx/SpriteSheet';
import type * as LoadModule from '../src/game/art/looks/load';
import type * as SelectionModule from '../src/game/art/looks/selection';
import type * as DesignsModule from '../src/game/art/looks/terraria/designs';
import type { ShowcaseParams } from '../src/game/scenes/params';
import { trackErrors } from './helpers';

/** Showcase demos worth one look each: every hero's moves, the customer, and every skill with its owner. */
const DEMOS: readonly ShowcaseParams[] = [
  { demo: 'moves', hero: 'hackerman' },
  { demo: 'moves', hero: 'artsy' },
  { demo: 'moves', hero: 'strategy', levelId: 'luna' },
  { demo: 'customer' },
  ...(['full-stack-attack', 'agent-summon', 'ux-elixir', 'power-chord', 'north-star', 'churn-shield'] as const).map(
    (skill) => ({ demo: 'skill', skill }) as const,
  ),
];

async function open(page: Page, query: Record<string, string>): Promise<void> {
  await page.goto(`/?${new URLSearchParams({ host: 'flat', seed: '1', frames: '0', ...query })}`);
  await page.waitForFunction(() => window.__arcadeReady === true);
}

test('plays every showcase demo without errors, landing on the same frame every time', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, { scene: 'showcase', params: JSON.stringify(DEMOS[0]) });
  for (const params of DEMOS) {
    const [first, again] = await page.evaluate((params) => {
      const arcade = window.__arcade;
      if (!arcade) throw new Error('no harness');
      const frameAt = (steps: number): string => {
        arcade.goTo('showcase', params);
        arcade.step(steps);
        return arcade.game.canvas.toDataURL();
      };
      return [frameAt(150), frameAt(150)];
    }, params);
    expect(first, JSON.stringify(params)).toBe(again);
  }
  expect(await page.evaluate(() => window.__arcade?.state().scene)).toBe('showcase');
  expect(errors).toEqual([]);
});

test('fails loudly on an unknown look, naming the known ones', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/?${new URLSearchParams({ host: 'flat', looks: '{"customer":"neon"}' })}`);
  await expect
    .poll(() => errors.join('\n'))
    .toContain('looks.customer must be one of classic, arcade, portrait, hibit, terraria, got "neon"');
});

/**
 * Loads every registered piece of every look in the browser, as the
 * playground will, and draws the first and last frame of every animation:
 * each must show something, with hard-edged alpha only (docs/LOOKS.md).
 */
test('loads every registered look and draws every sheet crisply', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, { scene: 'specimen' });
  const report = await page.evaluate(async () => {
    // Vite serves the game's modules to the page by path, so the test loads looks exactly as the game does.
    const loadPath = '/src/game/art/looks/load.ts';
    const selectionPath = '/src/game/art/looks/selection.ts';
    const storePath = '/src/engine/assets/AssetStore.ts';
    const { loadLookLibrary } = (await import(loadPath)) as typeof LoadModule;
    const { DEFAULT_LOOKS } = (await import(selectionPath)) as typeof SelectionModule;
    const { AssetStore } = (await import(storePath)) as typeof AssetsModule;
    const library = await loadLookLibrary(new AssetStore());
    const problems: string[] = [];
    let drawn = 0;

    const inspect = (sheet: SpriteSheet) => {
      for (const animation of sheet.animationNames) {
        for (const frame of new Set([0, sheet.frameCount(animation) - 1])) {
          const canvas = document.createElement('canvas');
          canvas.width = sheet.width;
          canvas.height = sheet.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          sheet.drawFrame(ctx, animation, frame, sheet.origin.x, sheet.origin.y);
          const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((_, i) => i % 4 === 3);
          if (!alpha.some((value) => value === 255)) problems.push(`${sheet.name} ${animation}[${frame}] is blank`);
          if (alpha.some((value) => value !== 0 && value !== 255)) {
            problems.push(`${sheet.name} ${animation}[${frame}] has soft alpha`);
          }
          drawn++;
        }
      }
    };

    const { offer } = library;
    for (const [id, looks] of Object.entries(offer.characters)) {
      for (const look of looks) {
        const selection = { ...DEFAULT_LOOKS, characters: { ...DEFAULT_LOOKS.characters, [id]: look } };
        inspect(library.looks(selection).characters[id as keyof typeof offer.characters].sheet);
      }
    }
    for (const look of offer.customer) {
      inspect(library.looks({ ...DEFAULT_LOOKS, customer: look }).customer.sheet);
    }
    for (const [id, looks] of Object.entries(offer.skills)) {
      for (const look of looks) {
        const selection = { ...DEFAULT_LOOKS, skills: { ...DEFAULT_LOOKS.skills, [id]: look } };
        inspect(library.looks(selection).skills[id as keyof typeof offer.skills].icon);
      }
    }
    return { problems, drawn };
  });
  expect(report.problems).toEqual([]);
  expect(report.drawn).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

/**
 * The lineup loads the Terraria designs itself, outside the look selection:
 * draw each one as the lineup does, crisp, and no taller than the classic
 * heroes, whose height the captain asked them not to outgrow.
 */
test('opens the Terraria lineup and draws every design crisply, no taller than the classic heroes', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // The harness must fetch the designs before the lineup's first frame, or the scene throws.
  await open(page, { scene: 'lineup' });
  const report = await page.evaluate(async () => {
    const designsPath = '/src/game/art/looks/terraria/designs.ts';
    const loadPath = '/src/game/art/looks/load.ts';
    const selectionPath = '/src/game/art/looks/selection.ts';
    const storePath = '/src/engine/assets/AssetStore.ts';
    const { TERRARIA_DESIGNS, loadTerrariaDesigns, terrariaDesignSheet } = (await import(
      designsPath
    )) as typeof DesignsModule;
    const { loadLooks } = (await import(loadPath)) as typeof LoadModule;
    const { DEFAULT_LOOKS } = (await import(selectionPath)) as typeof SelectionModule;
    const { AssetStore } = (await import(storePath)) as typeof AssetsModule;
    const assets = new AssetStore();
    const [, looks] = await Promise.all([loadTerrariaDesigns(assets), loadLooks(DEFAULT_LOOKS, assets)]);

    /** The standing frame's drawn rows and whether any pixel is half see-through. */
    const measure = (sheet: SpriteSheet) => {
      const canvas = document.createElement('canvas');
      canvas.width = sheet.width;
      canvas.height = sheet.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      sheet.drawFrame(ctx, 'idle', 0, sheet.origin.x, sheet.origin.y);
      const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((_, i) => i % 4 === 3);
      const rows = [...Array(canvas.height).keys()].filter((y) =>
        alpha.subarray(y * canvas.width, (y + 1) * canvas.width).some((value) => value > 0),
      );
      return {
        height: rows.length === 0 ? 0 : (rows.at(-1) ?? 0) - (rows[0] ?? 0) + 1,
        soft: alpha.some((value) => value !== 0 && value !== 255),
      };
    };
    const classic = Object.values(looks.characters).map((look) => measure(look.sheet).height);
    const designs = TERRARIA_DESIGNS.map((design) => ({
      hero: design.hero,
      ...measure(terrariaDesignSheet(assets, design)),
    }));
    return { classic: Math.min(...classic), designs };
  });
  expect(report.designs).not.toHaveLength(0);
  for (const design of report.designs) {
    expect(design.height, design.hero).toBeGreaterThan(0);
    expect(design.height, design.hero).toBeLessThanOrEqual(report.classic);
    expect(design.soft, design.hero).toBe(false);
  }
  expect(await page.evaluate(() => window.__arcade?.state().scene)).toBe('lineup');
  expect(errors).toEqual([]);
});
