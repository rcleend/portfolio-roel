import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/game/audio/lab/main';

/**
 * Audio checked without ears: every track and effect is rendered offline
 * through the real synth and master bus (in Chromium's WebAudio), then
 * measured. Live playback is checked through the audio lab's service.
 */

/** Headroom the master bus must keep: nothing may reach the clipper's ceiling. */
const MAX_PEAK_DB = -1;
/** Tracks may differ from their average loudness by at most this much. */
const LOUDNESS_TOLERANCE_DB = 3;

async function openLab(page: Page): Promise<void> {
  await page.goto('/audio-lab.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__audioLab !== undefined);
}

test.describe('audio', () => {
  test.setTimeout(180_000);

  test('renders every track cleanly at a consistent loudness', async ({ page }) => {
    await openLab(page);
    const ids = await page.evaluate(() => [...(window.__audioLab?.musicIds ?? [])]);
    const reports = [];
    for (const id of ids) {
      const report = await page.evaluate((track) => window.__audioLab?.measureTrack(track), id);
      if (!report) throw new Error(`no report for ${id}`);
      reports.push(report);
    }
    expect(reports).toHaveLength(8);
    for (const report of reports) {
      expect(report.nonFinite, report.id).toBe(0);
      expect(report.peakDb, report.id).toBeLessThan(MAX_PEAK_DB);
      expect(report.seconds, report.id).toBeGreaterThan(report.passSeconds);
    }
    const mean = reports.reduce((sum, report) => sum + report.loudnessDb, 0) / reports.length;
    for (const report of reports) {
      expect(Math.abs(report.loudnessDb - mean), `${report.id} loudness vs mean`).toBeLessThanOrEqual(
        LOUDNESS_TOLERANCE_DB,
      );
    }
  });

  test('renders every effect short, audible and clip-free', async ({ page }) => {
    await openLab(page);
    const ids = await page.evaluate(() => [...(window.__audioLab?.sfxIds ?? [])]);
    for (const id of ids) {
      const report = await page.evaluate((effect) => window.__audioLab?.measureSfx(effect), id);
      if (!report) throw new Error(`no report for ${id}`);
      expect(report.nonFinite, id).toBe(0);
      expect(report.lengthSeconds, id).toBeLessThanOrEqual(1.5);
      expect(report.peakDb, id).toBeLessThan(MAX_PEAK_DB);
      expect(report.peakDb, `${id} is audible`).toBeGreaterThan(-30);
      // Rendered past its nominal end, the effect must have died away completely.
      expect(report.tailPeakDb, `${id} has ended`).toBeLessThan(-60);
    }
  });

  test('plays after a gesture, then pauses, mutes and resumes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openLab(page);
    // Music requested before any gesture waits without creating an audio context.
    await page.evaluate(() => window.__audioLab?.service.playMusic('title'));
    expect(await page.evaluate(() => window.__audioLab?.service.context === null)).toBe(true);
    expect(await page.evaluate(() => window.__audioLab?.service.currentMusic)).toBe('title');

    // A real click is the user gesture browsers require before audio may start.
    await page.getByRole('button', { name: /^title/ }).click();
    await page.waitForFunction(() => window.__audioLab?.service.context?.state === 'running');
    await page.evaluate(() => {
      const lab = window.__audioLab;
      const context = lab?.service.context;
      if (!lab || !context) throw new Error('audio is not unlocked');
      const analyser = new AnalyserNode(context, { fftSize: 2048 });
      lab.service.connectMonitor(analyser);
      (window as unknown as { analyser: AnalyserNode }).analyser = analyser;
    });
    const level = (): Promise<number> =>
      page.evaluate(() => {
        const { analyser } = window as unknown as { analyser: AnalyserNode };
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return Math.max(...samples.map(Math.abs));
      });

    expect(await page.evaluate(() => window.__audioLab?.service.currentMusic)).toBe('title');
    await expect.poll(level, { timeout: 5_000 }).toBeGreaterThan(0.01);

    await page.evaluate(() => {
      if (window.__audioLab) window.__audioLab.service.muted = true;
    });
    await expect.poll(level, { timeout: 5_000 }).toBeLessThan(1e-4);
    await page.evaluate(() => {
      if (window.__audioLab) window.__audioLab.service.muted = false;
    });

    await page.evaluate(() => window.__audioLab?.service.setPaused(true));
    await page.waitForFunction(() => window.__audioLab?.service.context?.state === 'suspended');
    const frozen = await page.evaluate(() => window.__audioLab?.service.context?.currentTime ?? -1);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__audioLab?.service.context?.currentTime)).toBe(frozen);

    await page.evaluate(() => window.__audioLab?.service.setPaused(false));
    await page.waitForFunction(() => window.__audioLab?.service.context?.state === 'running');
    await expect.poll(level, { timeout: 5_000 }).toBeGreaterThan(0.01);

    // A hidden tab suspends audio; showing it again resumes.
    const setHidden = (hidden: boolean): Promise<void> =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await page.waitForFunction(() => window.__audioLab?.service.context?.state === 'suspended');
    await setHidden(false);
    await page.waitForFunction(() => window.__audioLab?.service.context?.state === 'running');

    await page.evaluate(() => window.__audioLab?.service.playMusic('boss'));
    expect(await page.evaluate(() => window.__audioLab?.service.currentMusic)).toBe('boss');
    expect(errors).toEqual([]);
  });
});
