import { ART, ART_SIZE, type ArtRect } from './art';
import { paintDeskPrints } from './deskArt';
import { paintRadioPrints } from './radioArt';

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
  kingdom(c, ART.coverKingdom);
  bricks(c, ART.coverBricks);
  powder(c, ART.coverPowder);
  consoleMark(c, ART.consoleMark);
  consoleLamp(c, ART.consoleLamp);
  paintRadioPrints(c);
  paintDeskPrints(c);
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

/** A fictional winter game: a rider's line down a peak under a low sun. */
function powder(c: Context, rect: ArtRect): void {
  within(c, rect, (w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1b4fb8');
    sky.addColorStop(0.55, '#7fc4f2');
    sky.addColorStop(1, '#eaf6ff');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffd98a';
    c.beginPath();
    c.arc(206, 150, 30, 0, Math.PI * 2);
    c.fill();
    // The far range, then the peak with its shaded face.
    c.fillStyle = '#5d8fd6';
    c.beginPath();
    c.moveTo(0, 250);
    for (const [x, y] of [
      [40, 196],
      [78, 226],
      [128, 170],
      [176, 222],
      [232, 184],
      [272, 214],
      [272, 368],
      [0, 368],
    ] as const)
      c.lineTo(x, y);
    c.fill();
    c.fillStyle = '#f6fbff';
    c.beginPath();
    c.moveTo(-10, 368);
    c.lineTo(108, 172);
    c.lineTo(150, 216);
    c.lineTo(182, 196);
    c.lineTo(290, 368);
    c.fill();
    c.fillStyle = '#b9d6f2';
    c.beginPath();
    c.moveTo(108, 172);
    c.lineTo(150, 216);
    c.lineTo(132, 262);
    c.lineTo(160, 300);
    c.lineTo(120, 368);
    c.lineTo(60, 368);
    c.lineTo(96, 280);
    c.lineTo(84, 236);
    c.fill();
    // The rider's line, the board at its end, and the spray it throws.
    c.strokeStyle = '#ff5a1f';
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(118, 190);
    c.bezierCurveTo(176, 236, 96, 262, 168, 296);
    c.bezierCurveTo(206, 314, 196, 330, 150, 340);
    c.stroke();
    c.save();
    c.translate(140, 340);
    c.rotate(-0.32);
    c.fillStyle = '#e32612';
    c.beginPath();
    c.ellipse(0, 0, 44, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#12204a';
    c.beginPath();
    c.ellipse(-4, -22, 10, 15, 0.3, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(4, -42, 7, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      c.globalAlpha = 0.5 + ((i * 29) % 50) / 100;
      c.beginPath();
      c.arc(176 + ((i * 53) % 78), 300 + ((i * 37) % 44), 1.5 + (i % 4), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    title(c, ['POWDER', 'RUSH'], w / 2 + 8, 74, 46, '#ffffff', '#12307a');
    spine(c, w, h, '#0c2f7c');
  });
}

/** The console's wordmark, the room's own, with the model's number in a ring. */
function consoleMark(c: Context, rect: ArtRect): void {
  within(c, rect, (_w, h) => {
    c.fillStyle = '#d6d6de';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = `600 44px ${SANS}`;
    c.fillText('reo·leo', 6, h / 2 + 1);
    const end = 6 + c.measureText('reo·leo').width;
    c.strokeStyle = '#d6d6de';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(end + 38, h / 2, 22, 0, Math.PI * 2);
    c.stroke();
    c.textAlign = 'center';
    c.font = `700 30px ${SANS}`;
    c.fillText('2', end + 38, h / 2 + 2);
  });
}

/** The console's standby lamp: a red point with a little bloom of its own. */
function consoleLamp(c: Context, rect: ArtRect): void {
  within(c, rect, (w, h) => {
    const glow = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,120,90,1)');
    glow.addColorStop(0.22, 'rgba(255,40,24,1)');
    glow.addColorStop(0.4, 'rgba(255,30,20,0.35)');
    glow.addColorStop(1, 'rgba(255,30,20,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
  });
}

/**
 * The view outside the window: a tree's crown against the night sky, as the rain on the glass refracts it
 * (atmosphere/WindowRain.ts). Leaves are a few thousand seeded dabs, darkest in the crown's depth, a few catching the
 * street's light; it is seen through wet glass and a blind, so it wants masses and glints, not botany.
 */
export function paintExterior(canvas: HTMLCanvasElement, width: number): void {
  const height = Math.round(width * 0.75);
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No 2D canvas for the view outside');
  const sky = c.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#0a0f2c');
  sky.addColorStop(0.6, '#141c46');
  sky.addColorStop(1, '#1b2350');
  c.fillStyle = sky;
  c.fillRect(0, 0, width, height);
  let seed = 20071;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Boughs first, then leaves over them in three depths.
  c.strokeStyle = '#05080f';
  c.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    c.lineWidth = width * (0.004 + random() * 0.01);
    c.beginPath();
    c.moveTo(width * (0.45 + random() * 0.2), height);
    c.quadraticCurveTo(width * random(), height * (0.4 + random() * 0.4), width * random(), height * random() * 0.5);
    c.stroke();
  }
  const depths = [
    { count: 2600, color: [6, 16, 22], size: 0.02 },
    { count: 2200, color: [12, 34, 40], size: 0.014 },
    { count: 700, color: [40, 84, 92], size: 0.009 },
  ];
  for (const depth of depths) {
    for (let i = 0; i < depth.count; i++) {
      // Clumps: a leaf lands near one of forty cluster centres, the crown thinning towards the top right.
      const cluster = Math.floor(random() * 40);
      const cx = ((cluster * 0.618) % 1) * width;
      const cy = (0.12 + ((cluster * 0.381) % 1) * 0.85) * height;
      const x = cx + (random() - 0.5) * width * 0.22;
      const y = cy + (random() - 0.5) * height * 0.2;
      const shade = 0.7 + random() * 0.6;
      c.fillStyle = `rgb(${depth.color.map((v) => Math.round(v * shade)).join(',')})`;
      c.beginPath();
      c.ellipse(
        x,
        y,
        width * depth.size * (0.6 + random()),
        width * depth.size * 0.45,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
}
