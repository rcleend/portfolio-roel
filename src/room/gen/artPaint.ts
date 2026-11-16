import { ART, ART_SIZE, type ArtRect } from './art';

/**
 * Paints the art page (art.ts): every print in the generated room, drawn with the 2D canvas. The covers are
 * fictional, made for this room; the TV's wordmark is the site's own.
 */
export function paintArt(canvas: HTMLCanvasElement, size: number): void {
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No 2D canvas for the generated room’s prints');
  c.setTransform(size / ART_SIZE, 0, 0, size / ART_SIZE, 0, 0);
  c.clearRect(0, 0, ART_SIZE, ART_SIZE);
  legends(c, ART.legends);
  engineer(c, ART.coverEngineer);
  kingdom(c, ART.coverKingdom);
  bricks(c, ART.coverBricks);
  chest(c, ART.chest);
}

type Context = CanvasRenderingContext2D;
const SANS = 'Helvetica, Arial, sans-serif';

function within(c: Context, [x, y, w, h]: ArtRect, draw: (w: number, h: number) => void): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(x, y);
  draw(w, h);
  c.restore();
}

/** 0.30 m of the TV's chin from z = -0.48: the legends under their buttons and jacks, the wordmark above. */
function legends(c: Context, rect: ArtRect): void {
  within(c, rect, (w) => {
    const u = (z: number) => ((z + 0.48) / 0.3) * w;
    c.fillStyle = '#aaaab4';
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.font = `600 10.5px ${SANS}`;
    c.fillText('POWER', u(-0.468), 104);
    c.fillText('▾ VOLUME ▴', u(-0.437), 104);
    c.fillText('▾ CHANNEL ▴', u(-0.405), 104);
    c.fillText('ACTION  TV/VIDEO', u(-0.366), 104);
    c.fillText('VIDEO IN      L – AUDIO – R', u(-0.228), 104);
    c.fillStyle = '#d6d6de';
    c.font = `600 40px ${SANS}`;
    c.fillText('reo·leo', u(-0.32), 42);
  });
}

function title(
  c: Context,
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string,
): void {
  c.save();
  c.translate(x, y);
  c.transform(1, -0.08, -0.18, 1, 0, 0);
  c.font = `900 ${size}px Impact, 'Arial Black', ${SANS}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  lines.forEach((line, index) => {
    c.lineWidth = size * 0.16;
    c.strokeStyle = stroke;
    c.strokeText(line, 0, index * size * 0.95);
    c.fillStyle = fill;
    c.fillText(line, 0, index * size * 0.95);
  });
  c.restore();
}

function spine(c: Context, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(0, 0, w, 20);
  c.fillStyle = '#e8e8ee';
  c.font = `700 11px ${SANS}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('REO·LEO 2', 10, 10);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, h - 14, w, 14);
}

/** Product Engineer: a blueprint in the TV title's blue and amber. */
function engineer(c: Context, rect: ArtRect): void {
  within(c, rect, (w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b2a6b');
    sky.addColorStop(1, '#061540');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,170,255,0.22)';
    c.lineWidth = 1;
    for (let x = 0; x <= w; x += 17) {
      c.beginPath();
      c.moveTo(x, 20);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 20; y <= h; y += 17) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    // A rising chart and a set on its stand, as drawing lines.
    c.strokeStyle = 'rgba(170,205,255,0.75)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(34, 300);
    for (const [x, y] of [
      [80, 280],
      [120, 288],
      [165, 246],
      [205, 252],
      [240, 205],
    ] as const)
      c.lineTo(x, y);
    c.stroke();
    c.strokeRect(92, 196, 92, 70);
    c.strokeRect(102, 205, 72, 50);
    c.beginPath();
    c.moveTo(112, 266);
    c.lineTo(104, 282);
    c.moveTo(164, 266);
    c.lineTo(172, 282);
    c.stroke();
    title(c, ['PRODUCT', 'ENGINEER'], w / 2 + 8, 82, 46, '#ff9a1f', '#7a1d00');
    c.fillStyle = '#ffd25a';
    c.fillRect(102, 205, 72, 50);
    c.fillStyle = '#0b2a6b';
    c.font = `800 13px ${SANS}`;
    c.textAlign = 'center';
    c.fillText('PRESS START', 138, 232);
    spine(c, w, h, '#0a1a44');
  });
}

/** A fictional adventure: a crown and a key over a night sea. */
function kingdom(c: Context, rect: ArtRect): void {
  within(c, rect, (w, h) => {
    const sky = c.createRadialGradient(w / 2, 150, 10, w / 2, 170, 260);
    sky.addColorStop(0, '#5b78d8');
    sky.addColorStop(0.5, '#1c2a78');
    sky.addColorStop(1, '#070a2a');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2e6b0';
    c.beginPath();
    c.arc(w / 2, 150, 46, 0, Math.PI * 2);
    c.fill();
    // The key across the moon.
    c.strokeStyle = '#e9b93c';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(96, 232, 22, 0, Math.PI * 2);
    c.moveTo(116, 222);
    c.lineTo(214, 150);
    c.moveTo(190, 168);
    c.lineTo(204, 186);
    c.moveTo(204, 158);
    c.lineTo(218, 176);
    c.stroke();
    // The crown.
    c.fillStyle = '#e9b93c';
    c.beginPath();
    c.moveTo(96, 96);
    for (const [x, y] of [
      [112, 62],
      [128, 88],
      [140, 52],
      [152, 88],
      [168, 62],
      [184, 96],
    ] as const)
      c.lineTo(x, y);
    c.closePath();
    c.fill();
    c.fillStyle = '#0a0f38';
    c.fillRect(0, 286, w, h - 286);
    title(c, ['CROWN', '& KEY'], w / 2 + 6, 312, 34, '#f4f0ff', '#27135e');
    spine(c, w, h, '#0a0f38');
  });
}

/** A fictional building game: bricks in space. */
function bricks(c: Context, rect: ArtRect): void {
  within(c, rect, (w, h) => {
    c.fillStyle = '#05060c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const x = (i * 97 + 31) % w;
      const y = 24 + ((i * 181 + 57) % (h - 30));
      c.globalAlpha = 0.35 + ((i * 37) % 60) / 100;
      c.fillRect(x, y, 1 + (i % 2), 1 + (i % 2));
    }
    c.globalAlpha = 1;
    const brick = (x: number, y: number, color: string, studs: number) => {
      c.fillStyle = color;
      c.fillRect(x, y, studs * 22, 26);
      for (let s = 0; s < studs; s++) c.fillRect(x + 4 + s * 22, y - 7, 14, 7);
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(x, y + 20, studs * 22, 6);
    };
    brick(58, 232, '#d82a20', 4);
    brick(102, 206, '#f0c020', 3);
    brick(80, 180, '#2a62d0', 4);
    brick(124, 154, '#30a040', 2);
    title(c, ['BRICK', 'GALAXY'], w / 2 + 8, 78, 40, '#ffd400', '#5a3a00');
    c.fillStyle = '#c9ccd8';
    c.font = `700 12px ${SANS}`;
    c.textAlign = 'center';
    c.fillText('THE BUILD-IT-YOURSELF SAGA', w / 2, 318);
    spine(c, w, h, '#101425');
  });
}

/** The robot's chest: two instrument columns, each a dial, a warning mark, a row of lamps and a plate. */
function chest(c: Context, rect: ArtRect): void {
  within(c, rect, (w, h) => {
    c.fillStyle = '#0b0b0c';
    c.fillRect(0, 0, w, h);
    for (const left of [8, w / 2 + 4]) {
      const width = w / 2 - 12;
      c.fillStyle = '#e8c63a';
      c.fillRect(left, 10, width, 34);
      c.strokeStyle = '#0b0b0c';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(left + width / 2, 46, 24, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
      c.beginPath();
      c.moveTo(left + width / 2, 44);
      c.lineTo(left + width / 2 + 12, 22);
      c.stroke();
      c.fillStyle = '#e8c63a';
      c.beginPath();
      c.moveTo(left + width / 2, 54);
      c.lineTo(left + width / 2 + 16, 80);
      c.lineTo(left + width / 2 - 16, 80);
      c.closePath();
      c.fill();
      c.fillStyle = '#0b0b0c';
      c.fillRect(left + width / 2 - 2, 62, 4, 10);
      c.fillRect(left + width / 2 - 2, 74, 4, 3);
      c.fillStyle = '#d8d8d2';
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(left + 9 + i * ((width - 18) / 3), 94, 4.5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#e8c63a';
      for (let i = 0; i < 5; i++) c.fillRect(left + 4 + i * (width / 5), 108, width / 10, 7);
      c.fillStyle = '#d8d8d2';
      c.fillRect(left, 124, width, 26);
      c.fillStyle = '#0b0b0c';
      c.font = `800 13px ${SANS}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(left < w / 2 ? '– 01 –' : '– 02 –', left + width / 2, 138);
    }
  });
}
