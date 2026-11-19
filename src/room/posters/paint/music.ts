import {
  burst,
  type Ctx,
  type Design,
  disc,
  glow,
  greek,
  halftone,
  line,
  poly,
  ramp,
  rect,
  ring,
  rnd,
  turned,
  type,
  within,
} from './kit';

/*
 * The music on the walls: one fictional band, The Loud Hours, and their record Curfew (a retail poster, a tour banner,
 * an album print, a CD single, a live pull-out), two photocopied flyers and a festival bill. Every name, mark and
 * drawing is made up for this room.
 */

const CREAM = '#eadfc6';
const INK = '#16131a';
const RED = '#c9301f';
const MUSTARD = '#e6b422';

/** The band's mark: a clock at five to midnight. */
function clock(c: Ctx, x: number, y: number, r: number, face: string, hands: string): void {
  disc(c, face, x, y, r);
  c.lineCap = 'round';
  line(c, hands, r * 0.13, [x, y, x, y - r * 0.7]);
  line(c, hands, r * 0.16, [x, y, x - r * 0.24, y - r * 0.44]);
  c.lineCap = 'butt';
  disc(c, hands, x, y, r * 0.1);
  for (let i = 0; i < 12; i++) {
    const [dx, dy] = [Math.sin((i * Math.PI) / 6), -Math.cos((i * Math.PI) / 6)];
    line(c, hands, r * (i % 3 ? 0.04 : 0.08), [
      x + dx * r * 0.82,
      y + dy * r * 0.82,
      x + dx * r * 0.93,
      y + dy * r * 0.93,
    ]);
  }
}

/** A skyline of flat-topped blocks along a baseline, as one silhouette. */
function skyline(c: Ctx, color: string, seed: number, x0: number, x1: number, base: number, tall: number): void {
  c.fillStyle = color;
  for (let x = x0, i = 0; x < x1; i++) {
    const w = tall * (0.16 + 0.3 * rnd(seed, i * 2));
    const h = tall * (0.25 + 0.75 * rnd(seed, i * 2 + 1) ** 1.6);
    c.fillRect(x, base - h, w + 0.5, h + 0.5);
    // A mast or a water tank on some roofs.
    if (rnd(seed, i * 2 + 77) > 0.7) c.fillRect(x + w * 0.4, base - h - tall * 0.12, w * 0.08, tall * 0.12);
    x += w;
  }
}

/** B1 · the retail poster: a red sun over a rooftop skyline, the band's name in the black below. */
export const loudHours: Design = (c, w, h) => {
  rect(c, CREAM, 0, 0, w, h);
  const horizon = h * 0.66;
  const [sx, sy, sr] = [w * 0.5, h * 0.37, w * 0.36];
  burst(c, 'rgba(201,48,31,0.16)', sx, sy, sr * 1.08, w * 1.2, 22, 0.07);
  disc(c, RED, sx, sy, sr);
  // The sun sinks into ink: halftone that closes up towards the roofs.
  c.save();
  c.beginPath();
  c.arc(sx, sy, sr, 0, 2 * Math.PI);
  c.clip();
  halftone(c, INK, sx - sr, sy - sr * 0.1, sr * 2, sr * 1.1, w * 0.021, (_x, y) => ((y - sy) / sr + 0.08) ** 1.5);
  c.restore();
  clock(c, sx, sy - sr * 0.1, sr * 0.42, CREAM, INK);
  skyline(c, INK, 11, 0, w, horizon, h * 0.2);
  rect(c, INK, 0, horizon - 1, w, h - horizon + 1);
  // Lit windows, a few.
  c.fillStyle = MUSTARD;
  for (let i = 0; i < 26; i++)
    c.fillRect(rnd(5, i) * w, horizon - h * 0.012 - rnd(6, i) * h * 0.06, w * 0.012, w * 0.016);
  type(c, 'THE LOUD', w / 2, horizon + h * 0.125, w * 0.178, CREAM, { max: w * 0.88 });
  type(c, 'HOURS', w / 2, horizon + h * 0.262, w * 0.235, CREAM, { max: w * 0.88 });
  rect(c, RED, w * 0.06, h * 0.947, w * 0.88, h * 0.004);
  type(c, 'CURFEW · THE NEW RECORD · OUT NOW', w / 2, h * 0.978, w * 0.03, MUSTARD, { t: 0.14 });
  type(c, 'LIVE', w * 0.06, h * 0.06, w * 0.05, INK, { a: 'left', t: 0.2 });
  type(c, '& LOUD', w * 0.94, h * 0.06, w * 0.05, INK, { a: 'right', t: 0.2 });
};

/** G1 · the album print: the clock alone on black. */
export const curfew: Design = (c, w, h) => {
  rect(c, '#0d0c10', 0, 0, w, h);
  disc(
    c,
    glow(c, w * 0.5, h * 0.5, w * 0.6, [
      [0, 'rgba(201,48,31,0.28)'],
      [1, 'rgba(201,48,31,0)'],
    ]),
    w / 2,
    h / 2,
    w * 0.6,
  );
  clock(c, w * 0.5, h * 0.48, w * 0.3, RED, CREAM);
  type(c, 'THE LOUD HOURS', w * 0.07, h * 0.1, w * 0.052, CREAM, { a: 'left', t: 0.22 });
  type(c, 'CURFEW', w * 0.93, h * 0.94, w * 0.105, CREAM, { a: 'right', t: 0.08 });
  rect(c, RED, w * 0.07, h * 0.905, w * 0.3, h * 0.012);
};

/** F3 · the tour banner: hazard stripes, the tour's name, a column of dates. */
export const curfewTour: Design = (c, w, h) => {
  rect(c, INK, 0, 0, w, h);
  for (const y of [0, h * 0.87]) {
    within(c, 0, y, w, h * 0.13, () => {
      rect(c, MUSTARD, 0, 0, w, h * 0.13);
      c.fillStyle = INK;
      for (let x = -h * 0.2; x < w; x += h * 0.2) {
        c.beginPath();
        c.moveTo(x, h * 0.13);
        c.lineTo(x + h * 0.13, 0);
        c.lineTo(x + h * 0.23, 0);
        c.lineTo(x + h * 0.1, h * 0.13);
        c.fill();
      }
    });
  }
  clock(c, w * 0.11, h * 0.5, h * 0.22, RED, CREAM);
  type(c, 'THE LOUD HOURS', w * 0.225, h * 0.33, h * 0.09, CREAM, { a: 'left', t: 0.12, max: w * 0.43 });
  type(c, 'CURFEW', w * 0.222, h * 0.62, h * 0.3, MUSTARD, { a: 'left', max: w * 0.45 });
  type(c, 'TOUR 2005', w * 0.225, h * 0.78, h * 0.11, RED, { a: 'left', t: 0.3 });
  rect(c, 'rgba(234,223,198,0.25)', w * 0.705, h * 0.2, w * 0.003, h * 0.6);
  type(c, 'EUROPE · UK', w * 0.73, h * 0.3, h * 0.07, CREAM, { a: 'left', t: 0.1, max: w * 0.22 });
  greek(c, 'rgba(234,223,198,0.75)', 3, w * 0.73, h * 0.37, w * 0.22, 8, h * 0.052);
};

/** C3 · the CD single on the corkboard. */
export const lastBus: Design = (c, w, h) => {
  rect(c, RED, 0, 0, w, h);
  rect(c, INK, 0, h * 0.72, w, h * 0.28);
  clock(c, w * 0.5, h * 0.4, w * 0.24, INK, CREAM);
  type(c, 'LAST BUS HOME', w / 2, h * 0.86, w * 0.1, CREAM, { t: 0.06, max: w * 0.9 });
  type(c, 'THE LOUD HOURS', w / 2, h * 0.95, w * 0.052, MUSTARD, { t: 0.14 });
};

/** M4 · a photocopied flyer for a basement show. */
export const basementShow: Design = (c, w, h) => {
  rect(c, '#e2c544', 0, 0, w, h);
  c.lineWidth = w * 0.02;
  c.strokeStyle = INK;
  c.strokeRect(w * 0.05, w * 0.05, w * 0.9, h - w * 0.1);
  burst(c, INK, w * 0.5, h * 0.37, w * 0.2, w * 0.36, 14, 0.2);
  disc(c, INK, w * 0.5, h * 0.37, w * 0.25);
  turned(c, w * 0.5, h * 0.385, -0.14, () => type(c, 'LIVE!', 0, 0, w * 0.2, '#e2c544', { f: 'c' }));
  type(c, 'BASEMENT', w / 2, h * 0.68, w * 0.165, INK, { max: w * 0.8 });
  type(c, 'SHOW', w / 2, h * 0.8, w * 0.2, INK, { t: 0.1 });
  rect(c, INK, w * 0.1, h * 0.835, w * 0.8, h * 0.055);
  type(c, 'FRI 9PM · 5 BUCKS', w / 2, h * 0.877, w * 0.07, '#e2c544', { t: 0.05 });
  greek(c, INK, 9, w * 0.14, h * 0.915, w * 0.72, 2, h * 0.022, true);
  type(c, 'ALL AGES', w * 0.5, h * 0.095, w * 0.06, INK, { t: 0.3 });
};

/** M5 · a festival's set times, torn from a programme. */
export const setTimes: Design = (c, w, h) => {
  rect(c, '#df8a4c', 0, 0, w, h);
  rect(c, INK, 0, 0, w, h * 0.17);
  type(c, 'SET TIMES', w / 2, h * 0.095, w * 0.15, '#df8a4c', { t: 0.06 });
  type(c, 'MAIN STAGE · SATURDAY', w / 2, h * 0.148, w * 0.052, CREAM, { t: 0.1 });
  for (let row = 0; row < 9; row++) {
    const y = h * (0.25 + row * 0.078);
    type(c, `${13 + row}:${row % 2 ? '30' : '00'}`, w * 0.09, y, w * 0.07, INK, { a: 'left', f: 's' });
    const length = w * (0.25 + 0.3 * rnd(21, row));
    rect(c, row === 7 ? '#8d1d12' : INK, w * 0.4, y - h * 0.034, length, h * (row === 7 ? 0.04 : 0.028));
    rect(c, 'rgba(22,19,26,0.35)', w * 0.09, y + h * 0.018, w * 0.82, h * 0.003);
  }
  type(c, 'NO RE-ENTRY', w / 2, h * 0.975, w * 0.05, INK, { t: 0.2 });
};

/** A stage light: a cone of coloured haze from a lamp on the truss. */
function beam(c: Ctx, x: number, y: number, to: number, floor: number, spread: number, color: string): void {
  poly(
    c,
    ramp(c, x, y, to, floor, [
      [0, `rgba(${color},0.6)`],
      [1, `rgba(${color},0)`],
    ]),
    [x - 2, y, x + 2, y, to + spread, floor, to - spread, floor],
  );
  disc(
    c,
    glow(c, x, y, spread * 0.5, [
      [0, '#fff'],
      [0.25, `rgba(${color},0.9)`],
      [1, `rgba(${color},0)`],
    ]),
    x,
    y,
    spread * 0.5,
  );
}

/** A player on stage, as a silhouette of a few strokes; `arm` raises the picking hand. */
function player(c: Ctx, x: number, base: number, tall: number, lean: number, arm: number): void {
  c.strokeStyle = '#050408';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const hip = base - tall * 0.48;
  const neck = base - tall * 0.84;
  const stroke = (width: number, points: readonly number[]): void => line(c, '#050408', tall * width, points);
  stroke(0.085, [x - tall * 0.11, base, x, hip, x + tall * 0.13, base]);
  stroke(0.15, [x, hip, x + lean, neck]);
  disc(c, '#050408', x + lean * 1.25, neck - tall * 0.1, tall * 0.075);
  // The guitar: a body at the hip and a neck up to the left.
  stroke(0.05, [x + tall * 0.08, hip - tall * 0.02, x - tall * 0.36, hip - tall * 0.26]);
  disc(c, '#050408', x + tall * 0.07, hip - tall * 0.02, tall * 0.1);
  stroke(0.06, [x + lean, neck + tall * 0.04, x - tall * 0.2, hip - tall * 0.12]);
  stroke(0.06, [
    x + lean,
    neck + tall * 0.04,
    x + tall * 0.2,
    neck - tall * arm,
    x + tall * 0.26,
    neck - tall * (arm + 0.16),
  ]);
  c.lineCap = 'butt';
}

/** S4 · the magazine pull-out: the band live, in the lights. */
export const liveSpecial: Design = (c, w, h) => {
  rect(
    c,
    ramp(c, 0, 0, 0, h, [
      [0, '#0b0714'],
      [0.6, '#1c0d2c'],
      [1, '#07050b'],
    ]),
    0,
    0,
    w,
    h,
  );
  c.globalCompositeOperation = 'lighter';
  const floor = h * 0.86;
  beam(c, w * 0.12, h * 0.07, w * 0.3, floor, w * 0.1, '255,60,120');
  beam(c, w * 0.34, h * 0.05, w * 0.3, floor, w * 0.08, '60,190,255');
  beam(c, w * 0.52, h * 0.045, w * 0.52, floor, w * 0.12, '255,170,50');
  beam(c, w * 0.7, h * 0.05, w * 0.76, floor, w * 0.08, '60,190,255');
  beam(c, w * 0.9, h * 0.07, w * 0.72, floor, w * 0.1, '255,60,120');
  disc(
    c,
    glow(c, w * 0.52, h * 0.62, w * 0.34, [
      [0, 'rgba(255,190,110,0.5)'],
      [1, 'rgba(255,120,60,0)'],
    ]),
    w * 0.52,
    h * 0.62,
    w * 0.34,
  );
  c.globalCompositeOperation = 'source-over';
  // The truss, the drum riser and its kit, three players.
  rect(c, '#050408', 0, h * 0.03, w, h * 0.022);
  for (let x = 0; x < w; x += w * 0.03)
    line(c, '#050408', w * 0.003, [x, h * 0.03, x + w * 0.015, h * 0.075, x + w * 0.03, h * 0.03]);
  rect(c, '#050408', 0, h * 0.072, w, h * 0.008);
  const stage = h * 0.8;
  rect(c, '#050408', w * 0.42, stage - h * 0.09, w * 0.2, h * 0.09);
  disc(c, '#050408', w * 0.52, stage - h * 0.15, h * 0.075);
  disc(c, '#050408', w * 0.52, stage - h * 0.27, h * 0.035);
  line(c, '#050408', h * 0.012, [w * 0.44, stage - h * 0.2, w * 0.475, stage - h * 0.09]);
  line(c, '#050408', h * 0.012, [w * 0.6, stage - h * 0.22, w * 0.565, stage - h * 0.09]);
  rect(c, '#050408', w * 0.41, stage - h * 0.215, w * 0.07, h * 0.012);
  rect(c, '#050408', w * 0.565, stage - h * 0.235, w * 0.07, h * 0.012);
  player(c, w * 0.27, stage, h * 0.36, w * 0.01, 0.28);
  player(c, w * 0.76, stage, h * 0.34, -w * 0.012, 0.02);
  line(c, '#050408', h * 0.008, [w * 0.33, stage, w * 0.33, stage - h * 0.27]);
  rect(c, '#050408', 0, stage, w, h - stage);
  // The crowd: heads and raised hands against the stage's glow.
  for (let i = 0; i < 46; i++) {
    const x = (i / 45) * w + (rnd(31, i) - 0.5) * w * 0.02;
    const y = h * (0.93 - 0.07 * rnd(32, i));
    disc(c, '#020203', x, y, h * 0.035);
    if (rnd(33, i) > 0.55)
      line(c, '#020203', h * 0.016, [x + h * 0.03, y + h * 0.02, x + h * 0.045, y - h * (0.06 + 0.07 * rnd(34, i))]);
  }
  // The magazine's furniture.
  rect(c, RED, w * 0.035, h * 0.12, w * 0.13, h * 0.11);
  type(c, 'LIVE!', w * 0.1, h * 0.203, h * 0.085, '#fff', { f: 'c' });
  type(c, 'THE LOUD HOURS', w * 0.965, h * 0.165, h * 0.062, '#fff', { a: 'right', t: 0.14 });
  type(c, 'Curfew tour · the velodrome, night two', w * 0.965, h * 0.215, h * 0.034, 'rgba(255,255,255,0.75)', {
    a: 'right',
    wt: 600,
  });
};

/** S2 · the festival bill: a midsummer sun over the hills. */
export const solstice: Design = (c, w, h) => {
  const NAVY = '#1c2140';
  rect(c, '#f1e3c2', 0, 0, w, h);
  const [sx, sy] = [w * 0.5, h * 0.4];
  within(c, 0, 0, w, h * 0.66, () => {
    rect(c, '#f2b632', 0, 0, w, h * 0.66);
    burst(c, '#ea7a2c', sx, sy, 0, h, 16, -0.098);
    disc(c, '#f1e3c2', sx, sy, w * 0.27);
    disc(c, '#d9432b', sx, sy, w * 0.235);
    halftone(c, '#b52c22', sx - w * 0.24, sy - w * 0.02, w * 0.48, w * 0.27, w * 0.024, (x, y) => {
      const inside = Math.hypot(x - sx, y - sy) < w * 0.225;
      return inside ? ((y - sy) / (w * 0.235)) ** 1.3 : 0;
    });
  });
  // Three ranges of hills, the nearest carrying the stage and the tents.
  const ground = h * 0.66;
  const hill = (color: string, y: number, amp: number, phase: number): void => {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, ground);
    for (let x = 0; x <= w; x += w / 40) c.lineTo(x, y - Math.sin((x / w) * Math.PI * 2 + phase) * amp);
    c.lineTo(w, ground);
    c.fill();
  };
  hill('#c4552b', h * 0.565, h * 0.022, 0.6);
  hill('#7d2f3a', h * 0.6, h * 0.02, 2.4);
  hill(NAVY, h * 0.635, h * 0.014, 4.2);
  rect(c, NAVY, 0, ground - 1, w, h * 0.012);
  poly(c, NAVY, [w * 0.6, h * 0.63, w * 0.66, h * 0.575, w * 0.8, h * 0.575, w * 0.86, h * 0.63]);
  rect(c, '#f2b632', w * 0.672, h * 0.59, w * 0.116, h * 0.03);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.08 + i * 0.07);
    poly(c, i % 2 ? '#f1e3c2' : '#f2b632', [x, h * 0.642, x + w * 0.022, h * 0.612, x + w * 0.044, h * 0.642]);
    line(c, NAVY, w * 0.003, [x + w * 0.022, h * 0.612, x + w * 0.022, h * 0.596]);
  }
  type(c, 'SOLSTICE', w / 2, h * 0.795, w * 0.2, NAVY, { max: w * 0.9, t: 0.02 });
  rect(c, '#d9432b', w * 0.06, h * 0.818, w * 0.88, h * 0.036);
  type(c, 'OPEN AIR · 21 JUNE · DUSK TILL DAWN', w / 2, h * 0.845, w * 0.036, '#f1e3c2', { t: 0.14 });
  type(c, 'THE LOUD HOURS', w / 2, h * 0.9, w * 0.062, NAVY, { t: 0.1 });
  for (let column = 0; column < 3; column++) {
    greek(
      c,
      column === 1 ? '#7d2f3a' : NAVY,
      40 + column,
      w * (0.08 + column * 0.295),
      h * 0.925,
      w * 0.25,
      4,
      h * 0.0135,
      true,
    );
  }
  type(c, 'TWELFTH EDITION', w / 2, h * 0.05, w * 0.034, NAVY, { t: 0.4 });
  ring(c, NAVY, w * 0.004, sx, sy, w * 0.27);
};
