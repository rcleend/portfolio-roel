/**
 * The page as the startup still is sampled from and held to (docs/ROOM.md › Startup): the live room alone, the set on
 * and its picture one colour. For the still's build (live.ts) and its e2e test alike.
 */
import type { Page } from '@playwright/test';

/** All of the page but the room's canvas: the still, the game's picture on it, the controls. */
const ROOM_ONLY =
  '#root > :not(#game), #game > :not(.room-host), #tv-still { visibility: hidden !important; transition: none !important }';

/** Opens the page on the game's title at a quality tier and waits for the lit room behind the still, the set on. */
export async function showRoom(page: Page, origin: string, tier: 'high' | 'medium' | 'low'): Promise<void> {
  await page.goto(`${origin}?debug&seed=1&scene=title&quality=${tier}`);
  await page.addStyleTag({ content: ROOM_ONLY });
  await page.waitForFunction(() => document.querySelector('.room-host')?.getAttribute('data-ready') === 'true', null, {
    timeout: 90_000,
  });
  await page.waitForFunction(() => {
    const room = (window as { __room?: { shown: boolean; powerState: string } }).__room;
    return room?.shown === true && room.powerState === 'on';
  });
  // The rest of the room's light is baked behind the first frame.
  await page.waitForTimeout(3500);
}

/** Paints every frame of the game over with one colour from here on, and waits for the room to show it. */
export async function fillPicture(page: Page, colour: string): Promise<void> {
  await page.evaluate((fill) => {
    const scope = window as {
      __stillFill?: string;
      __arcade?: { game: { canvas: HTMLCanvasElement; onFrame(listener: () => void): void; render(): void } };
    };
    const game = scope.__arcade?.game;
    if (!game) throw new Error('The page has no game to paint over');
    if (scope.__stillFill === undefined)
      game.onFrame(() => {
        const context = game.canvas.getContext('2d');
        if (!context) return;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = scope.__stillFill as string;
        context.fillRect(0, 0, game.canvas.width, game.canvas.height);
        context.restore();
      });
    scope.__stillFill = fill;
    game.render();
  }, colour);
  await page.waitForTimeout(900);
}
