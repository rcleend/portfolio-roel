import type { ArtRect } from './art';

/**
 * The CD player's prints: the tuner scale, the wordmark and the mode line on its display lens, and the legends under
 * its controls, on one strip of the art page (art.ts). All of it is drawn here; the wordmark is the site's own and the
 * legends are plain words, no maker's.
 */
export const RADIO_ART: ArtRect = [0, 512, 1024, 136];

/** The legends by the front panel's controls, each 24 mm × 5 mm at four pixels a millimetre. */
export const RADIO_LABELS = ['TUNING', 'BASS', 'PHONES', 'TONE', 'OPR', 'FUNCTION', 'BAND', 'VOLUME'] as const;
export type RadioLabel = (typeof RADIO_LABELS)[number];

const at = (x: number, y: number, w: number, h: number): ArtRect => [RADIO_ART[0] + x, RADIO_ART[1] + y, w, h];

export const RADIO_PRINTS = {
  /** 104 mm × 16 mm under the display: the FM and AM scales, and what the machine does. */
  scale: at(0, 0, 416, 64),
  /** 26 mm × 16 mm left of the display, round its key: what the key does. */
  mark: at(420, 0, 104, 64),
  /** 26 mm × 16 mm right of it, round the other. */
  modes: at(528, 0, 104, 64),
  /** 16 mm × 32 mm beside each slide switch: its positions, top to bottom. */
  positions: { band: at(636, 0, 64, 128), mode: at(704, 0, 64, 128) },
  label: (name: RadioLabel): ArtRect => at(RADIO_LABELS.indexOf(name) * 78, 72, 76, 20),
} as const;

const SANS = 'Helvetica, Arial, sans-serif';

/** Paints the strip; `c` is scaled to the 1024-pixel art page. */
export function paintRadioPrints(c: CanvasRenderingContext2D): void {
  const within = ([x, y, w, h]: ArtRect, draw: (w: number, h: number) => void): void => {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.translate(x, y);
    draw(w, h);
    c.restore();
  };
  c.textBaseline = 'middle';
  // The display's legends: small, dense, bold enough to hold at a glance.
  within(RADIO_PRINTS.scale, (w) => {
    const row = (y: number, band: string, unit: string, marks: readonly string[]): void => {
      c.fillStyle = '#d4d4e2';
      c.textAlign = 'left';
      c.font = `800 10.5px ${SANS}`;
      c.fillText(band, 6, y);
      c.textAlign = 'right';
      c.fillText(unit, w - 6, y);
      c.textAlign = 'center';
      c.font = `700 10.5px ${SANS}`;
      marks.forEach((mark, index) => {
        const x = 50 + (index * (w - 112)) / (marks.length - 1);
        c.fillText(mark, x, y);
      });
    };
    row(9, 'FM', 'MHz', ['88', '90', '94', '98', '102', '106', '108']);
    // The scale's own ticks between the two bands, five to a number.
    c.fillStyle = '#a2a2b4';
    for (let i = 0; i <= 30; i++)
      c.fillRect(50 + (i * (w - 112)) / 30 - 0.5, i % 5 === 0 ? 17 : 19, 1, i % 5 === 0 ? 7 : 3);
    row(32, 'AM', 'kHz', ['530', '600', '700', '900', '1200', '1500', '1700']);
    c.fillStyle = '#b4b4c6';
    c.textAlign = 'left';
    c.font = `800 12px ${SANS}`;
    c.fillText('reo·leo', 6, 53);
    c.font = `700 8.5px ${SANS}`;
    c.fillStyle = '#9c9cae';
    c.fillText('CD  RADIO  CASSETTE-CORDER', 56, 54);
    c.textAlign = 'right';
    c.fillText('REPEAT 1·ALL   SHUFFLE   PGM 20', w - 6, 54);
  });
  const key = (rect: ArtRect, over: string, under: readonly string[]): void =>
    within(rect, (w) => {
      c.textAlign = 'center';
      c.fillStyle = '#c4c4d4';
      c.font = `800 9px ${SANS}`;
      c.fillText(over, w / 2, 7);
      c.fillStyle = '#9c9cae';
      c.font = `700 8px ${SANS}`;
      under.forEach((line, i) => {
        c.fillText(line, w / 2, 55 - (under.length - 1 - i) * 9);
      });
    });
  key(RADIO_PRINTS.mark, 'PLAY MODE', ['CLOCK']);
  key(RADIO_PRINTS.modes, 'DISPLAY', ['ENTER', 'MEMORY']);
  c.fillStyle = '#16171d';
  const positions = (rect: ArtRect, names: readonly string[]): void =>
    within(rect, (_w, h) => {
      c.textAlign = 'left';
      c.font = `800 9.5px ${SANS}`;
      names.forEach((name, i) => {
        const y = 22 + (i * (h - 44)) / (names.length - 1);
        c.fillRect(2, y - 0.75, 5, 1.5);
        c.fillText(name, 11, y + 0.5);
      });
    });
  positions(RADIO_PRINTS.positions.band, ['RADIO', 'TAPE', 'CD']);
  positions(RADIO_PRINTS.positions.mode, ['FM ST', 'FM', 'AM']);
  c.textAlign = 'center';
  c.font = `800 11px ${SANS}`;
  for (const name of RADIO_LABELS) within(RADIO_PRINTS.label(name), (w, h) => c.fillText(name, w / 2, h / 2 + 0.5));
}
