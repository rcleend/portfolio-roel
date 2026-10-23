import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/harness/harness';
import type { Action } from '../src/game/input/bindings';

/** Collects console errors and uncaught exceptions so any of them fails the test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openLevel(page: Page, params: Record<string, unknown>): Promise<void> {
  const query = new URLSearchParams({
    host: 'flat',
    seed: '1',
    scene: 'level',
    frames: '0',
    params: JSON.stringify(params),
  });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__arcadeReady === true);
}

/** Holds `actions` for `frames` steps through the harness's virtual buttons. */
async function hold(page: Page, actions: readonly Action[], frames: number): Promise<void> {
  await page.evaluate(
    ({ actions, frames }) => {
      const arcade = window.__arcade;
      if (!arcade) throw new Error('no harness');
      for (const action of actions) arcade.game.input.virtual.press(action);
      arcade.step(frames);
      for (const action of actions) arcade.game.input.virtual.release(action);
      arcade.step(1);
    },
    { actions, frames },
  );
}

async function scene(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__arcade?.state().scene ?? null);
}

test('plays the opening of a level — running, jumping, attacking, skills, pause — without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await openLevel(page, { levelId: 'luna', characterId: 'artsy' });
  for (let i = 0; i < 6; i++) {
    await hold(page, ['right', 'attack'], 40);
    await hold(page, ['right', 'jump'], 18);
  }
  await hold(page, ['skill1'], 2);
  await hold(page, ['skill2'], 2);
  await hold(page, [], 60);
  await hold(page, ['pause'], 2);
  await hold(page, ['down'], 2);
  await hold(page, ['back'], 2);
  await hold(page, ['right', 'attack'], 60);
  expect(await scene(page)).toBe('level');
  expect(errors).toEqual([]);
});

test('a full mission ends on the stage-clear screen with the result saved', async ({ page }) => {
  const errors = trackErrors(page);
  await openLevel(page, { levelId: 'scripe', characterId: 'hackerman', skipIntro: true, autopilot: true });
  // The autopilot is a deterministic first-timer: it clears a mission in well under two minutes of game time.
  for (let second = 0; second < 120 && (await scene(page)) === 'level'; second += 10) {
    await page.evaluate(() => window.__arcade?.step(600));
  }
  await page.evaluate(() => window.__arcade?.step(120));
  expect(await scene(page)).toBe('stageClear');
  const session = (await page.evaluate(() => window.__arcade?.state().session)) as {
    completed: string[];
    bestScore: Record<string, number>;
  };
  expect(session.completed).toContain('scripe');
  expect(session.bestScore.scripe).toBeGreaterThanOrEqual(2_500);
  expect(errors).toEqual([]);
});
