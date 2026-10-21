import { WebAudioService } from '@/engine/audio/WebAudioService';
import { MUSIC_IDS, type MusicId, SFX_IDS, type SfxId } from '../ids';
import { music } from '../music';
import { sfx } from '../sfx';
import { measureSfx, measureTrack, type SfxReport, type TrackReport } from './measure';
import { startScope } from './scope';

/**
 * Audio lab (`/audio-lab.html`, development only): play every track and
 * effect, toggle mute and pause, and render everything offline to check
 * levels. `window.__audioLab` exposes the same for Playwright.
 */
const service = new WebAudioService<MusicId, SfxId>({ music, sfx });

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`audio-lab.html is missing #${id}`);
  return found as T;
}

const status = element<HTMLSpanElement>('status');
let scopeStarted = false;

async function ensureUnlocked(): Promise<void> {
  await service.unlock();
  const context = service.context;
  if (!scopeStarted && context) {
    const analyser = new AnalyserNode(context, { fftSize: 2048 });
    service.connectMonitor(analyser);
    startScope(element('scope'), analyser);
    scopeStarted = true;
  }
  refreshStatus();
}

function refreshStatus(): void {
  const state = service.context?.state ?? 'locked';
  status.textContent = `${state} · music: ${service.currentMusic ?? '—'}${service.muted ? ' · muted' : ''}`;
}

function button(parent: HTMLElement, label: string, detail: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    node.append(small);
  }
  node.addEventListener('click', () => {
    void ensureUnlocked().then(() => {
      onClick();
      refreshStatus();
    });
  });
  parent.append(node);
  return node;
}

const transport = element('transport');
button(transport, 'Stop music', '', () => service.stopMusic({ fadeOutMs: 400 }));
const muteButton = button(transport, 'Mute', '', () => {
  service.muted = !service.muted;
  muteButton.setAttribute('aria-pressed', String(service.muted));
});
let paused = false;
const pauseButton = button(transport, 'Pause', '', () => {
  paused = !paused;
  service.setPaused(paused);
  pauseButton.setAttribute('aria-pressed', String(paused));
});

for (const id of MUSIC_IDS) {
  const song = music[id];
  button(element('music'), id, `${Math.round(song.bpm)} bpm`, () => service.playMusic(id, { fadeInMs: 150 }));
}
for (const id of SFX_IDS) button(element('sfx'), id, '', () => service.playSfx(id));

const db = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : '−∞');

element('measure').addEventListener('click', async () => {
  const table = element<HTMLTableElement>('report');
  table.innerHTML =
    '<tr><th>id</th><th>bpm</th><th>pass s</th><th>loop s</th><th>render s</th><th>peak</th><th>loudness</th><th>rms</th><th>tail</th><th>NaN</th></tr>';
  const addRow = (cells: readonly string[], badPeak: boolean): void => {
    const row = table.insertRow();
    cells.forEach((text, index) => {
      const cell = row.insertCell();
      cell.textContent = text;
      if (index === 5 && badPeak) cell.className = 'bad';
    });
  };
  for (const id of MUSIC_IDS) {
    const report: TrackReport = await measureTrack(id);
    addRow(
      [
        id,
        report.bpm.toFixed(1),
        report.passSeconds.toFixed(2),
        report.loopSeconds?.toFixed(2) ?? 'one-shot',
        report.seconds.toFixed(2),
        db(report.peakDb),
        db(report.loudnessDb),
        db(report.rmsDb),
        db(report.tailPeakDb),
        String(report.nonFinite),
      ],
      report.peakDb > -1,
    );
  }
  for (const id of SFX_IDS) {
    const report: SfxReport = await measureSfx(id);
    addRow(
      [
        id,
        '',
        report.lengthSeconds.toFixed(2),
        '',
        report.seconds.toFixed(2),
        db(report.peakDb),
        db(report.loudnessDb),
        db(report.rmsDb),
        db(report.tailPeakDb),
        String(report.nonFinite),
      ],
      report.peakDb > -1,
    );
  }
});

declare global {
  interface Window {
    __audioLab?: {
      readonly service: WebAudioService<MusicId, SfxId>;
      readonly musicIds: readonly MusicId[];
      readonly sfxIds: readonly SfxId[];
      measureTrack(id: MusicId): Promise<TrackReport>;
      measureSfx(id: SfxId): Promise<SfxReport>;
    };
  }
}

window.__audioLab = { service, musicIds: MUSIC_IDS, sfxIds: SFX_IDS, measureTrack, measureSfx };
refreshStatus();
