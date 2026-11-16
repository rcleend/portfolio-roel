import type { ArtRect } from './art';

/**
 * The CD player's prints: the tuner scale, the wordmark and the mode line on its display lens, and the legends under
 * its controls, on one strip of the art page (art.ts). All of it is drawn here; the wordmark is the site's own and the
 * legends are plain words, no maker's.
 */
export const RADIO_ART: ArtRect = [0, 512, 1024, 136];

/** The legends under the front panel's controls, each 32 mm × 6 mm at four pixels a millimetre. */
export const RADIO_LABELS = ['TUNING', 'BASS', 'PHONES', 'FUNCTION', 'OPR', 'BAND', 'MODE', 'VOLUME'] as const;
export type RadioLabel = (typeof RADIO_LABELS)[number];

const at = (x: number, y: number, w: number, h: number): ArtRect => [RADIO_ART[0] + x, RADIO_ART[1] + y, w, h];

export const RADIO_PRINTS = {
  /** 104 mm × 16 mm under the display: the FM and AM scales. */
  scale: at(0, 0, 416, 64),
  /** 26 mm × 16 mm left of the display: the wordmark. */
  mark: at(420, 0, 104, 64),
  /** 26 mm × 16 mm right of it: what the machine plays. */
  modes: at(528, 0, 104, 64),
  label: (name: RadioLabel): ArtRect => at(RADIO_LABELS.indexOf(name) * 128, 72, 128, 24),
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
  within(RADIO_PRINTS.scale, (w) => {
    const row = (y: number, band: string, unit: string, marks: readonly string[]): void => {
      c.fillStyle = '#c9c9d6';
      c.textAlign = 'left';
      c.font = `700 13px ${SANS}`;
      c.fillText(band, 4, y);
      c.textAlign = 'right';
      c.fillText(unit, w - 4, y);
      c.textAlign = 'center';
      c.font = `600 13px ${SANS}`;
      marks.forEach((mark, index) => {
        const x = 52 + (index * (w - 110)) / (marks.length - 1);
        c.fillText(mark, x, y);
      });
      // The scale's own ticks, five to a number.
      c.fillStyle = '#8f8fa0';
      for (let i = 0; i <= (marks.length - 1) * 5; i++) {
        const x = 52 + (i * (w - 110)) / ((marks.length - 1) * 5);
        c.fillRect(x - 0.5, y + 10, 1, i % 5 === 0 ? 6 : 3);
      }
    };
    row(14, 'FM', 'MHz', ['88', '92', '96', '100', '104', '108']);
    row(44, 'AM', 'kHz', ['530', '650', '800', '1000', '1300', '1600']);
  });
  within(RADIO_PRINTS.mark, (w, h) => {
    c.fillStyle = '#dcdce6';
    c.textAlign = 'center';
    c.font = `600 25px ${SANS}`;
    c.fillText('reo·leo', w / 2, h / 2 - 6);
    c.fillStyle = '#9a9aaa';
    c.font = `600 9.5px ${SANS}`;
    c.fillText('STEREO  CD  DECK', w / 2, h / 2 + 17);
  });
  within(RADIO_PRINTS.modes, (w, h) => {
    c.textAlign = 'center';
    c.fillStyle = '#c9c9d6';
    c.font = `700 10.5px ${SANS}`;
    c.fillText('CD · TAPE · RADIO', w / 2, h / 2 - 12);
    c.fillStyle = '#9a9aaa';
    c.font = `600 9px ${SANS}`;
    c.fillText('1-BIT  ·  20 TRACK', w / 2, h / 2 + 5);
    c.fillText('PROGRAMME', w / 2, h / 2 + 19);
  });
  c.textAlign = 'center';
  c.fillStyle = '#16171d';
  c.font = `700 15px ${SANS}`;
  for (const name of RADIO_LABELS) within(RADIO_PRINTS.label(name), (w, h) => c.fillText(name, w / 2, h / 2 + 1));
}
