import type { ArtRect } from './art';
import { keyboardKeys } from './props/keyboardLayout';

/**
 * The desk's prints, on one block of the art page (art.ts): the keyboard's 104 legends, a tile a key in the order of
 * its layout (props/keyboardLayout.ts), the words under its lock lamps, and a small lamp's glow (the monitor's and
 * the keyboard's, tinted where they are used). All of it is drawn here, in white: a decal's tint is its ink.
 */
export const DESK_ART: ArtRect = [0, 656, 744, 296];

const at = (x: number, y: number, w: number, h: number): ArtRect => [DESK_ART[0] + x, DESK_ART[1] + y, w, h];

/** A legend's tile: the top left corner of a cap, 11.6 mm square. */
const TILE = 40;
const COLUMNS = 16;
export const legendTile = (index: number): ArtRect =>
  at((index % COLUMNS) * TILE, Math.floor(index / COLUMNS) * TILE, TILE, TILE);

export const DESK_PRINTS = {
  /** A white point with a little bloom of its own. */
  lamp: at(648, 4, 32, 32),
  /** 64 mm × 8.5 mm under the three lock lamps. */
  locks: at(648, 44, 96, 13),
  /** 40 mm × 5 mm on the tower's disc drive, and 30 mm × 12 mm on its badge. */
  drive: at(648, 62, 96, 12),
  badge: at(648, 80, 90, 36),
} as const;

const SANS = 'Helvetica, Arial, sans-serif';

/** Paints the block; `c` is scaled to the 1024-pixel art page. */
export function paintDeskPrints(c: CanvasRenderingContext2D): void {
  c.save();
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  keyboardKeys().forEach((key, index) => {
    const [x, y] = legendTile(index);
    c.save();
    c.beginPath();
    c.rect(x, y, TILE, TILE);
    c.clip();
    c.translate(x, y);
    legend(c, key.label, key.upper);
    c.restore();
  });
  {
    const [x, y, w, h] = DESK_PRINTS.lamp;
    const glow = c.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.2, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.42, 'rgba(255,255,255,0.3)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(x, y, w, h);
  }
  {
    const [x, y, w, h] = DESK_PRINTS.locks;
    c.fillStyle = '#fff';
    c.font = `700 7px ${SANS}`;
    c.textAlign = 'center';
    ['NUM', 'CAPS', 'SCROLL'].forEach((word, i) => void c.fillText(word, x + w * (0.156 + i * 0.344), y + h / 2 + 0.5));
  }
  {
    const [x, y, , h] = DESK_PRINTS.drive;
    c.textAlign = 'left';
    c.font = `700 9px ${SANS}`;
    c.fillText('CD-ROM', x + 2, y + h / 2 + 0.5);
    c.font = `600 8px ${SANS}`;
    c.fillText('24x', x + 46, y + h / 2 + 0.5);
  }
  {
    const [x, y, w, h] = DESK_PRINTS.badge;
    c.textAlign = 'center';
    c.font = `700 13px ${SANS}`;
    c.fillText('MULTIMEDIA', x + w / 2, y + h * 0.34);
    c.font = `600 9px ${SANS}`;
    c.fillText('P C  ·  2 3 3', x + w / 2, y + h * 0.72);
  }
  c.restore();
}

/** One cap's legend in its 40-pixel tile. */
function legend(c: CanvasRenderingContext2D, label: string, upper?: string): void {
  const arrows: Readonly<Record<string, readonly [number, number]>> = {
    '←': [-1, 0],
    '→': [1, 0],
    '↑': [0, -1],
    '↓': [0, 1],
  };
  const arrow = arrows[label];
  if (arrow) {
    const [dx, dy] = arrow;
    const [cx, cy] = [15, 15];
    c.lineWidth = 2.6;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(cx - dx * 8, cy - dy * 8);
    c.lineTo(cx + dx * 8, cy + dy * 8);
    c.moveTo(cx + dx * 8 - (dx + dy) * 5, cy + dy * 8 - (dy - dx) * 5);
    c.lineTo(cx + dx * 8, cy + dy * 8);
    c.lineTo(cx + dx * 8 - (dx - dy) * 5, cy + dy * 8 - (dy + dx) * 5);
    c.stroke();
    return;
  }
  if (upper) {
    c.font = `600 15px ${SANS}`;
    c.fillText(upper, 6, 10.5);
    c.fillText(label, 6, 29);
    return;
  }
  if (label.length === 1) {
    c.font = `600 21px ${SANS}`;
    c.fillText(label, 5, 14.5);
    return;
  }
  c.font = `600 ${/^F\d/.test(label) ? 13 : 10.5}px ${SANS}`;
  c.fillText(label, 4, 10.5);
}
