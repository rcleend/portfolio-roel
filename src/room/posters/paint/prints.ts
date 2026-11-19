import {
  type Ctx,
  type Design,
  disc,
  glow,
  greek,
  line,
  noise1,
  poly,
  ramp,
  rect,
  ridge,
  ring,
  rnd,
  stars,
  turned,
  type,
  within,
} from './kit';

/*
 * Prints, drawings and the corkboard's paper: a star chart, a patent drawing, a bumper sticker, a travel print, a
 * film one-sheet for a film that was never made, a blueprint, and what gets pinned up (a postcard, a note, a ticket, a
 * boarding pass, a snapshot). All drawn here; none copies a real print.
 */

/** M1 · the star chart: the northern sky on a polar grid, a few made-up constellations joined up. */
export const northernSky: Design = (c, w, h) => {
  const CREAM = '#efe6cf';
  rect(c, '#0c1736', 0, 0, w, h);
  const [cx, cy, r] = [w / 2, h * 0.455, w * 0.385];
  disc(
    c,
    glow(c, cx, cy, r, [
      [0, '#1c2f66'],
      [1, '#101d45'],
    ]),
    cx,
    cy,
    r,
  );
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, 2 * Math.PI);
  c.clip();
  // The Milky Way: a band of dust across the chart.
  turned(c, cx, cy, -0.6, () => {
    c.fillStyle = 'rgba(190,205,255,0.2)';
    c.beginPath();
    for (let i = 0; i < 700; i++) {
      const x = (rnd(101, i) - 0.5) * r * 2.2;
      const y = (rnd(102, i) + rnd(103, i) - 1) * r * 0.3 + Math.sin(x / r) * r * 0.12;
      const s = w * (0.003 + 0.006 * rnd(104, i));
      c.rect(x, y, s, s);
    }
    c.fill();
  });
  for (let i = 1; i < 4; i++) ring(c, 'rgba(239,230,207,0.22)', w * 0.0022, cx, cy, (r * i) / 4);
  for (let i = 0; i < 12; i++) {
    const [dx, dy] = [Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6)];
    line(c, 'rgba(239,230,207,0.2)', w * 0.0022, [cx + dx * r * 0.25, cy + dy * r * 0.25, cx + dx * r, cy + dy * r]);
  }
  // The ecliptic, dashed.
  c.save();
  c.translate(cx + r * 0.12, cy + r * 0.2);
  c.scale(1, 0.82);
  c.setLineDash([w * 0.012, w * 0.012]);
  ring(c, 'rgba(227,181,90,0.7)', w * 0.003, 0, 0, r * 0.74);
  c.setLineDash([]);
  c.restore();
  stars(c, 105, 260, w, h, 'rgba(239,230,207,0.85)', w * 0.0021);
  // Constellations: chains of bright stars, each around its own centre.
  for (let k = 0; k < 9; k++) {
    const angle = (k / 9) * 2 * Math.PI + rnd(106, k);
    const reach = r * (0.25 + 0.55 * rnd(107, k));
    const points: number[] = [];
    let [x, y] = [cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach];
    let heading = rnd(108, k) * 6.3;
    const count = 4 + Math.floor(rnd(109, k) * 4);
    for (let i = 0; i < count; i++) {
      points.push(x, y);
      heading += (rnd(110, k * 16 + i) - 0.5) * 2.2;
      const step = r * (0.09 + 0.1 * rnd(111, k * 16 + i));
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
    }
    line(c, 'rgba(239,230,207,0.6)', w * 0.0028, points);
    for (let i = 0; i < points.length; i += 2) {
      const bright = rnd(112, k * 16 + i) > 0.6;
      disc(c, bright ? '#f4cf7a' : CREAM, points[i] as number, points[i + 1] as number, w * (bright ? 0.0085 : 0.0055));
    }
  }
  // The pole star, with its cross.
  line(c, '#f4cf7a', w * 0.003, [cx - w * 0.022, cy, cx + w * 0.022, cy]);
  line(c, '#f4cf7a', w * 0.003, [cx, cy - w * 0.022, cx, cy + w * 0.022]);
  disc(c, '#fff', cx, cy, w * 0.008);
  c.restore();
  ring(c, CREAM, w * 0.006, cx, cy, r);
  ring(c, CREAM, w * 0.002, cx, cy, r * 1.045);
  for (let i = 0; i < 72; i++) {
    const [dx, dy] = [Math.cos((i * Math.PI) / 36), Math.sin((i * Math.PI) / 36)];
    const out = i % 6 ? 1.022 : 1.045;
    line(c, CREAM, w * 0.002, [cx + dx * r, cy + dy * r, cx + dx * r * out, cy + dy * r * out]);
  }
  (['N', 'E', 'S', 'W'] as const).forEach((letter, i) => {
    const [dx, dy] = [Math.sin((i * Math.PI) / 2), -Math.cos((i * Math.PI) / 2)];
    type(c, letter, cx + dx * r * 1.1, cy + dy * r * 1.1 + w * 0.011, w * 0.03, '#f4cf7a');
  });
  type(c, 'NORTHERN SKY', w / 2, h * 0.925, w * 0.062, CREAM, { t: 0.36 });
  type(c, 'THE STARS OF A SUMMER NIGHT · 52° NORTH', w / 2, h * 0.962, w * 0.019, 'rgba(239,230,207,0.75)', {
    t: 0.3,
    wt: 600,
  });
  c.lineWidth = w * 0.003;
  c.strokeStyle = 'rgba(239,230,207,0.6)';
  c.strokeRect(w * 0.035, w * 0.035, w * 0.93, h - w * 0.07);
};

/** A dimension line with arrowheads and its figure. */
function dimension(
  c: Ctx,
  ink: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  label: string,
  size: number,
): void {
  line(c, ink, size * 0.07, [x0, y0, x1, y1]);
  const [dx, dy] = [(x1 - x0) / Math.hypot(x1 - x0, y1 - y0), (y1 - y0) / Math.hypot(x1 - x0, y1 - y0)];
  for (const [x, y, s] of [
    [x0, y0, 1],
    [x1, y1, -1],
  ] as const) {
    poly(c, ink, [
      x,
      y,
      x + s * (dx * size * 0.5 - dy * size * 0.16),
      y + s * (dy * size * 0.5 + dx * size * 0.16),
      x + s * (dx * size * 0.5 + dy * size * 0.16),
      y + s * (dy * size * 0.5 - dx * size * 0.16),
    ]);
    line(c, ink, size * 0.07, [x - dy * size * 0.4, y + dx * size * 0.4, x + dy * size * 0.4, y - dx * size * 0.4]);
  }
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  rect(c, '#e9e1cd', mx - size * 0.9, my - size * 0.5, size * 1.8, size);
  type(c, label, mx, my + size * 0.3, size * 0.8, ink, { wt: 600 });
}

/** A numbered callout: a leader from a part to a ringed figure. */
function callout(
  c: Ctx,
  ink: string,
  paper: string,
  x: number,
  y: number,
  tx: number,
  ty: number,
  label: string,
  size: number,
): void {
  line(c, ink, size * 0.07, [x, y, tx, ty]);
  disc(c, ink, x, y, size * 0.14);
  disc(c, paper, tx, ty, size * 0.62);
  ring(c, ink, size * 0.08, tx, ty, size * 0.62);
  type(c, label, tx, ty + size * 0.28, size * 0.78, ink, { wt: 600 });
}

/** M2 · the patent drawing: a handheld game apparatus, front and side. */
export const patent: Design = (c, w, h) => {
  const PAPER = '#e9e1cd';
  const INK = '#23222c';
  rect(c, PAPER, 0, 0, w, h);
  type(c, 'HANDHELD GAME APPARATUS', w / 2, h * 0.085, w * 0.04, INK, { t: 0.22 });
  greek(c, INK, 121, w * 0.3, h * 0.105, w * 0.4, 1, h * 0.014, true);
  line(c, INK, w * 0.003, [w * 0.08, h * 0.135, w * 0.92, h * 0.135]);
  const pen = w * 0.006;
  // Fig. 1: the front.
  const [x, y, bw, bh] = [w * 0.14, h * 0.24, w * 0.46, h * 0.56];
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = pen * 1.4;
  c.beginPath();
  c.roundRect(x, y, bw, bh, [bw * 0.08, bw * 0.08, bw * 0.24, bw * 0.08]);
  c.stroke();
  c.lineWidth = pen;
  c.strokeRect(x + bw * 0.12, y + bh * 0.08, bw * 0.76, bh * 0.42);
  within(c, x + bw * 0.18, y + bh * 0.12, bw * 0.64, bh * 0.34, () => {
    rect(c, 'rgba(35,34,44,0.08)', 0, 0, bw, bh);
    for (let i = -8; i < 30; i++)
      line(c, 'rgba(35,34,44,0.5)', pen * 0.45, [i * bw * 0.045, 0, i * bw * 0.045 + bh * 0.34, bh * 0.34]);
  });
  c.strokeRect(x + bw * 0.18, y + bh * 0.12, bw * 0.64, bh * 0.34);
  // The cross pad, two buttons, start and select, the speaker.
  const [px, py, arm] = [x + bw * 0.26, y + bh * 0.68, bw * 0.065];
  c.beginPath();
  for (const [dx, dy] of [
    [-1, -3],
    [1, -3],
    [1, -1],
    [3, -1],
    [3, 1],
    [1, 1],
    [1, 3],
    [-1, 3],
    [-1, 1],
    [-3, 1],
    [-3, -1],
    [-1, -1],
    [-1, -3],
  ] as const) {
    c.lineTo(px + dx * arm, py + dy * arm);
  }
  c.stroke();
  ring(c, INK, pen, x + bw * 0.66, y + bh * 0.71, bw * 0.065);
  ring(c, INK, pen, x + bw * 0.84, y + bh * 0.64, bw * 0.065);
  for (const sx of [0.38, 0.52]) {
    turned(c, x + bw * sx, y + bh * 0.88, -0.45, () => {
      c.beginPath();
      c.roundRect(-bw * 0.055, -bw * 0.016, bw * 0.11, bw * 0.032, bw * 0.016);
      c.stroke();
    });
  }
  for (let i = 0; i < 5; i++)
    line(c, INK, pen, [x + bw * (0.7 + i * 0.045), y + bh * 0.84, x + bw * (0.76 + i * 0.045), y + bh * 0.94]);
  // Fig. 2: the side.
  const [sx0, sw] = [w * 0.76, w * 0.07];
  c.lineWidth = pen * 1.4;
  c.beginPath();
  c.roundRect(sx0, y, sw, bh, sw * 0.3);
  c.stroke();
  c.lineWidth = pen;
  c.strokeRect(sx0 + sw, y + bh * 0.1, sw * 0.3, bh * 0.12);
  c.strokeRect(sx0 - sw * 0.2, y + bh * 0.62, sw * 0.2, bh * 0.1);
  line(
    c,
    INK,
    pen,
    [sx0 + sw * 0.5, y + bh * 0.05, sx0 + sw * 0.5, y + bh * 0.95],
    [w * 0.02, w * 0.008, w * 0.004, w * 0.008],
  );
  const fig = w * 0.036;
  dimension(c, INK, x, y - h * 0.045, x + bw, y - h * 0.045, '90', fig);
  dimension(c, INK, x - w * 0.055, y, x - w * 0.055, y + bh, '148', fig);
  callout(c, INK, PAPER, x + bw * 0.5, y + bh * 0.28, x + bw * 1.12, y + bh * 0.16, '10', fig);
  callout(c, INK, PAPER, px + arm * 2, py, x + bw * 0.1, y + bh * 1.09, '12', fig);
  callout(c, INK, PAPER, x + bw * 0.84, y + bh * 0.64, x + bw * 1.13, y + bh * 0.5, '14', fig);
  callout(c, INK, PAPER, x + bw * 0.8, y + bh * 0.89, x + bw * 0.93, y + bh * 1.09, '16', fig);
  callout(c, INK, PAPER, sx0 + sw * 1.15, y + bh * 0.16, sx0 + sw * 1.9, y + bh * 0.3, '18', fig);
  type(c, 'FIG. 1', x + bw / 2, h * 0.945, w * 0.04, INK, { f: 'c' });
  type(c, 'FIG. 2', sx0 + sw / 2, h * 0.945, w * 0.04, INK, { f: 'c' });
};

/** M3 · the bumper sticker. */
export const sideQuests: Design = (c, w, h) => {
  rect(c, '#f3f1ea', 0, 0, w, h);
  rect(c, '#17161c', h * 0.12, h * 0.12, w - h * 0.24, h * 0.76);
  rect(c, '#f2b632', h * 0.12, h * 0.12, h * 0.9, h * 0.76);
  // A quest marker in the yellow box.
  type(c, '!', h * 0.57, h * 0.76, h * 0.72, '#17161c');
  type(c, 'I BRAKE FOR SIDE QUESTS', h * 1.3, h * 0.7, h * 0.52, '#f3f1ea', { a: 'left', t: 0.06, max: w - h * 1.75 });
};

/** A1 · the travel print: the northern lights over an island's peaks, red cabins at the water. */
export const lofoten: Design = (c, w, h) => {
  const PAPER = '#efe6d2';
  rect(c, PAPER, 0, 0, w, h);
  const m = w * 0.055;
  const ph = h * 0.8;
  within(c, m, m, w - 2 * m, ph, () => {
    const pw = w - 2 * m;
    rect(
      c,
      ramp(c, 0, 0, 0, ph, [
        [0, '#0a1a3a'],
        [0.5, '#12416b'],
        [0.74, '#e79a6a'],
        [0.75, '#143057'],
        [1, '#0a1a3a'],
      ]),
      0,
      0,
      pw,
      ph,
    );
    stars(c, 131, 60, pw, ph * 0.5, 'rgba(255,255,255,0.8)', w * 0.004);
    // The aurora: three ribbons.
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      for (let x = 0; x < pw; x += pw / 60) {
        const top = ph * (0.08 + 0.1 * k) + noise1(132 + k, x / (pw * 0.28)) * ph * 0.22;
        const tall = ph * (0.14 + 0.12 * noise1(140 + k, x / (pw * 0.1)));
        rect(
          c,
          ramp(c, 0, top, 0, top + tall, [
            [0, 'rgba(90,255,170,0)'],
            [0.25, `rgba(${k === 1 ? '150,120,255' : '90,255,170'},0.34)`],
            [1, 'rgba(90,255,170,0)'],
          ]),
          x,
          top,
          pw / 60 + 0.4,
          tall,
        );
      }
    }
    c.globalCompositeOperation = 'source-over';
    const sea = ph * 0.745;
    ridge(c, '#3a5d8c', 133, 0, pw, ph * 0.56, ph * 0.13, pw * 0.4, sea);
    ridge(c, '#1f3d68', 134, 0, pw, ph * 0.62, ph * 0.11, pw * 0.28, sea);
    ridge(c, '#0d2244', 135, 0, pw, ph * 0.69, ph * 0.06, pw * 0.2, sea);
    // The cabins on their stilts, and their lights on the water.
    for (let i = 0; i < 4; i++) {
      const x = pw * (0.14 + i * 0.13 + (i > 1 ? 0.2 : 0));
      const s = pw * 0.045;
      rect(c, '#c9352b', x, sea - s * 0.9, s, s * 0.7);
      poly(c, '#7d1c18', [x - s * 0.1, sea - s * 0.9, x + s * 0.5, sea - s * 1.3, x + s * 1.1, sea - s * 0.9]);
      rect(c, '#ffd98a', x + s * 0.35, sea - s * 0.7, s * 0.28, s * 0.28);
      rect(c, '#0a1a3a', x + s * 0.1, sea - s * 0.2, s * 0.08, s * 0.2);
      rect(c, '#0a1a3a', x + s * 0.82, sea - s * 0.2, s * 0.08, s * 0.2);
      for (let j = 0; j < 5; j++)
        rect(
          c,
          `rgba(255,190,110,${0.6 - j * 0.11})`,
          x + s * 0.3 - j * s * 0.05,
          sea + s * (0.25 + j * 0.3),
          s * (0.4 + j * 0.1),
          s * 0.1,
        );
    }
    for (let j = 0; j < 14; j++)
      rect(
        c,
        'rgba(120,255,190,0.16)',
        rnd(136, j) * pw,
        sea + ph * (0.03 + 0.016 * j),
        pw * (0.08 + 0.2 * rnd(137, j)),
        ph * 0.004,
      );
  });
  type(c, 'LOFOTEN', w / 2, h * 0.935, w * 0.15, '#0d2244', { t: 0.18, max: w * 0.86 });
  type(c, 'NORGE · 68° NORD', w / 2, h * 0.972, w * 0.038, '#c9352b', { t: 0.3 });
};

/** S1 · the one-sheet: a ringed giant over a broken moon, one walker on the ridge. */
export const beyondKepler: Design = (c, w, h) => {
  rect(c, '#e9e5dc', 0, 0, w, h);
  const m = w * 0.035;
  const [pw, ph] = [w - 2 * m, h - 2 * m];
  within(c, m, m, pw, ph, () => {
    rect(
      c,
      ramp(c, 0, 0, 0, ph, [
        [0, '#05060f'],
        [0.35, '#1a1140'],
        [0.58, '#5b1f5e'],
        [0.7, '#c24a3a'],
        [0.76, '#f0a35a'],
      ]),
      0,
      0,
      pw,
      ph,
    );
    stars(c, 141, 240, pw, ph * 0.62, '#fff', w * 0.0022);
    // The giant: banded, lit from the lower left, its rings passing behind and in front.
    const [gx, gy, gr] = [pw * 0.62, ph * 0.3, pw * 0.36];
    const rings = (front: boolean): void => {
      c.save();
      c.translate(gx, gy);
      c.rotate(-0.38);
      c.scale(1, 0.2);
      c.beginPath();
      c.rect(-gr * 3, front ? 0 : -gr * 3, gr * 6, gr * 3);
      c.clip();
      ring(c, 'rgba(244,214,160,0.85)', gr * 0.16, 0, 0, gr * 1.55);
      ring(c, 'rgba(232,160,110,0.7)', gr * 0.09, 0, 0, gr * 1.78);
      ring(c, 'rgba(244,214,160,0.45)', gr * 0.05, 0, 0, gr * 1.95);
      c.restore();
    };
    rings(false);
    c.save();
    c.beginPath();
    c.arc(gx, gy, gr, 0, 2 * Math.PI);
    c.clip();
    c.translate(gx, gy);
    c.rotate(-0.38);
    const bands = ['#f3d9a4', '#e8b877', '#d98e5a', '#f0cf96', '#c9744e', '#e9bd80', '#f3d9a4', '#b9623f', '#e2a469'];
    bands.forEach((color, i) => {
      const y = -gr + (i / bands.length) * gr * 2;
      rect(c, color, -gr, y + noise1(142, i * 3.1) * gr * 0.05, gr * 2, (gr * 2) / bands.length + gr * 0.06);
    });
    c.rotate(0.38);
    disc(
      c,
      glow(c, -gr * 0.5, gr * 0.5, gr * 2.1, [
        [0.35, 'rgba(5,6,15,0)'],
        [0.8, 'rgba(5,6,15,0.92)'],
      ]),
      0,
      0,
      gr * 1.2,
    );
    c.restore();
    rings(true);
    // A small moon, and the ship's burn climbing past it.
    disc(c, '#cfc6d8', pw * 0.2, ph * 0.2, pw * 0.035);
    disc(c, 'rgba(5,6,15,0.7)', pw * 0.213, ph * 0.193, pw * 0.035);
    c.lineCap = 'round';
    c.strokeStyle = ramp(c, pw * 0.1, ph * 0.6, pw * 0.42, ph * 0.12, [
      [0, 'rgba(255,255,255,0)'],
      [1, '#fff'],
    ]);
    c.lineWidth = w * 0.005;
    c.beginPath();
    c.moveTo(pw * 0.08, ph * 0.62);
    c.quadraticCurveTo(pw * 0.2, ph * 0.3, pw * 0.42, ph * 0.12);
    c.stroke();
    c.lineCap = 'butt';
    disc(
      c,
      glow(c, pw * 0.42, ph * 0.12, pw * 0.04, [
        [0, '#fff'],
        [0.3, 'rgba(160,210,255,0.8)'],
        [1, 'rgba(160,210,255,0)'],
      ]),
      pw * 0.42,
      ph * 0.12,
      pw * 0.04,
    );
    // The ground: three ridges against the glow, the walker on the middle one.
    ridge(c, '#7a2a4a', 143, 0, pw, ph * 0.7, ph * 0.035, pw * 0.3, ph);
    ridge(c, '#2a1233', 144, 0, pw, ph * 0.745, ph * 0.04, pw * 0.22, ph);
    const [ax, ay, tall] = [pw * 0.33, ph * 0.728, ph * 0.034];
    c.lineCap = 'round';
    line(c, '#0a0612', tall * 0.16, [
      ax - tall * 0.16,
      ay + tall * 0.2,
      ax,
      ay - tall * 0.42,
      ax + tall * 0.18,
      ay + tall * 0.2,
    ]);
    line(c, '#0a0612', tall * 0.3, [ax, ay - tall * 0.4, ax, ay - tall * 0.78]);
    disc(c, '#0a0612', ax, ay - tall, tall * 0.19);
    line(c, '#0a0612', tall * 0.07, [ax + tall * 0.4, ay + tall * 0.2, ax + tall * 0.4, ay - tall * 1.5]);
    c.lineCap = 'butt';
    poly(c, '#f0a35a', [
      ax + tall * 0.4,
      ay - tall * 1.5,
      ax + tall * 0.95,
      ay - tall * 1.33,
      ax + tall * 0.4,
      ay - tall * 1.15,
    ]);
    ridge(c, '#0a0612', 145, 0, pw, ph * 0.8, ph * 0.035, pw * 0.16, ph);
    type(c, 'THE SILENCE WAS ONLY THE BEGINNING', pw / 2, ph * 0.045, pw * 0.03, 'rgba(255,255,255,0.85)', {
      t: 0.34,
      wt: 600,
    });
    type(c, 'BEYOND', pw / 2, ph * 0.845, pw * 0.05, '#f0a35a', { t: 0.9 });
    type(c, 'KEPLER', pw / 2, ph * 0.935, pw * 0.175, '#f4ecdf', { t: 0.1, max: pw * 0.9 });
    greek(c, 'rgba(244,236,223,0.55)', 146, pw * 0.14, ph * 0.955, pw * 0.72, 3, ph * 0.0105, true);
  });
};

/** S5 · the blueprint: an orbital tug, drawn to scale. */
export const orbitalTug: Design = (c, w, h) => {
  const WHITE = 'rgba(238,244,255,0.95)';
  rect(c, '#1b4a94', 0, 0, w, h);
  rect(
    c,
    glow(c, w * 0.4, h * 0.4, w * 0.8, [
      [0, 'rgba(70,130,220,0.5)'],
      [1, 'rgba(10,30,80,0.45)'],
    ]),
    0,
    0,
    w,
    h,
  );
  for (let i = 1; i < 40; i++) {
    const major = i % 5 === 0;
    rect(c, `rgba(238,244,255,${major ? 0.22 : 0.09})`, (i * w) / 40, 0, w * (major ? 0.0025 : 0.0016), h);
    if (i * (w / 40) < h)
      rect(c, `rgba(238,244,255,${major ? 0.22 : 0.09})`, 0, (i * w) / 40, w, w * (major ? 0.0025 : 0.0016));
  }
  const pen = w * 0.0055;
  c.strokeStyle = WHITE;
  c.lineWidth = pen;
  c.lineJoin = 'round';
  const cy = h * 0.43;
  // The hull, bow to engine bell.
  const [x0, x1, half] = [w * 0.24, w * 0.66, h * 0.085];
  c.beginPath();
  c.moveTo(x0, cy - half);
  c.lineTo(x1, cy - half);
  c.lineTo(x1, cy + half);
  c.lineTo(x0, cy + half);
  c.quadraticCurveTo(x0 - w * 0.13, cy, x0, cy - half);
  c.stroke();
  for (const x of [0.33, 0.45, 0.57]) line(c, WHITE, pen * 0.7, [w * x, cy - half, w * x, cy + half]);
  ring(c, WHITE, pen, w * 0.27, cy, half * 0.36);
  ring(c, WHITE, pen * 0.7, w * 0.39, cy, half * 0.22);
  line(c, WHITE, pen, [
    x1,
    cy - half * 0.6,
    x1 + w * 0.04,
    cy - half * 0.6,
    x1 + w * 0.13,
    cy - half * 1.25,
    x1 + w * 0.13,
    cy + half * 1.25,
    x1 + w * 0.04,
    cy + half * 0.6,
    x1,
    cy + half * 0.6,
  ]);
  for (let i = 1; i < 4; i++)
    line(c, WHITE, pen * 0.6, [
      x1 + w * 0.04 + i * w * 0.022,
      cy - half * (0.6 + i * 0.16),
      x1 + w * 0.04 + i * w * 0.022,
      cy + half * (0.6 + i * 0.16),
    ]);
  // Solar wings on their booms, a dish, the grapple arm.
  for (const side of [-1, 1]) {
    line(c, WHITE, pen, [w * 0.5, cy + side * half, w * 0.5, cy + side * half * 1.5]);
    c.strokeRect(w * 0.36, cy + side * half * 1.5 + (side < 0 ? -half * 1.5 : 0), w * 0.28, half * 1.5);
    for (let i = 1; i < 7; i++) {
      const x = w * (0.36 + i * 0.04);
      line(c, WHITE, pen * 0.5, [x, cy + side * half * 1.5, x, cy + side * half * 3]);
    }
    line(c, WHITE, pen * 0.5, [w * 0.36, cy + side * half * 2.25, w * 0.64, cy + side * half * 2.25]);
  }
  line(c, WHITE, pen, [w * 0.3, cy - half, w * 0.27, cy - half * 1.9]);
  c.beginPath();
  c.arc(w * 0.27, cy - half * 2.5, half * 0.75, 0.25, Math.PI - 0.25);
  c.closePath();
  c.stroke();
  line(c, WHITE, pen, [w * 0.2, cy + half * 0.4, w * 0.1, cy + half * 1.5, w * 0.06, cy + half * 1.1]);
  line(c, WHITE, pen, [w * 0.1, cy + half * 1.5, w * 0.075, cy + half * 1.9]);
  line(c, WHITE, pen * 0.6, [w * 0.05, cy, w * 0.86, cy], [w * 0.03, w * 0.01, w * 0.006, w * 0.01]);
  // Dimensions and the title block.
  const tick = (x: number, y0: number, y1: number): void => line(c, WHITE, pen * 0.6, [x, y0, x, y1]);
  const dimY = h * 0.82;
  tick(w * 0.135, cy + half, dimY + h * 0.02);
  tick(x1 + w * 0.13, cy + half * 1.25, dimY + h * 0.02);
  line(c, WHITE, pen * 0.6, [w * 0.135, dimY, x1 + w * 0.13, dimY]);
  poly(c, WHITE, [w * 0.135, dimY, w * 0.16, dimY - h * 0.01, w * 0.16, dimY + h * 0.01]);
  poly(c, WHITE, [x1 + w * 0.13, dimY, x1 + w * 0.105, dimY - h * 0.01, x1 + w * 0.105, dimY + h * 0.01]);
  rect(c, '#1b4a94', w * 0.4, dimY - h * 0.02, w * 0.14, h * 0.04);
  type(c, '14.60 M', w * 0.47, dimY + h * 0.012, w * 0.034, WHITE, { f: 's' });
  for (const [x, y, tx, ty, label] of [
    [w * 0.27, cy - half * 2.5, w * 0.12, h * 0.12, 'A'],
    [w * 0.6, cy - half * 2.2, w * 0.76, h * 0.12, 'B'],
    [x1 + w * 0.1, cy, w * 0.9, h * 0.3, 'C'],
    [w * 0.09, cy + half * 1.4, w * 0.07, h * 0.66, 'D'],
  ] as const) {
    line(c, WHITE, pen * 0.6, [x, y, tx, ty]);
    disc(c, '#1b4a94', tx, ty, w * 0.026);
    ring(c, WHITE, pen * 0.7, tx, ty, w * 0.026);
    type(c, label, tx, ty + w * 0.012, w * 0.032, WHITE, { f: 's' });
  }
  c.strokeRect(w * 0.52, h * 0.865, w * 0.44, h * 0.1);
  line(c, WHITE, pen * 0.6, [w * 0.82, h * 0.865, w * 0.82, h * 0.965]);
  type(c, 'ORBITAL TUG MK II', w * 0.535, h * 0.91, w * 0.026, WHITE, { f: 's', a: 'left', max: w * 0.27 });
  greek(c, 'rgba(238,244,255,0.6)', 151, w * 0.535, h * 0.93, w * 0.26, 2, h * 0.012);
  type(c, '1:48', w * 0.89, h * 0.928, w * 0.03, WHITE, { f: 's' });
  c.lineWidth = pen;
  c.strokeRect(w * 0.035, w * 0.035, w * 0.93, h - w * 0.07);
};

/** C4 · the postcard. */
export const postcard: Design = (c, w, h) => {
  rect(c, '#f4efe2', 0, 0, w, h);
  within(c, w * 0.05, w * 0.05, w * 0.9, h - w * 0.1, () => {
    const [pw, ph] = [w * 0.9, h - w * 0.1];
    rect(
      c,
      ramp(c, 0, 0, 0, ph, [
        [0, '#2d78c8'],
        [1, '#bfe3f5'],
      ]),
      0,
      0,
      pw,
      ph,
    );
    disc(c, '#ffe9a0', pw * 0.8, ph * 0.26, ph * 0.13);
    ridge(c, '#eef6fb', 161, 0, pw, ph * 0.56, ph * 0.22, pw * 0.35, ph);
    ridge(c, '#6f9a56', 162, 0, pw, ph * 0.82, ph * 0.1, pw * 0.3, ph);
    ridge(c, '#3f6b3a', 163, 0, pw, ph * 0.94, ph * 0.07, pw * 0.2, ph);
    type(c, 'Greetings from', pw * 0.06, ph * 0.26, ph * 0.17, '#fff', { f: 'c', a: 'left', o: '#17406e', ow: 0.18 });
    type(c, 'THE ALPS', pw / 2, ph * 0.66, ph * 0.3, '#e8352b', { o: '#fff', ow: 0.16, max: pw * 0.92 });
  });
};

/** C7 · the note: a to-do in felt pen. */
export const note: Design = (c, w, h) => {
  rect(c, '#f1dc63', 0, 0, w, h);
  rect(c, 'rgba(120,90,0,0.12)', 0, 0, w, h * 0.14);
  type(c, 'v1.0', w * 0.1, h * 0.36, w * 0.24, '#1d2b6b', { f: 'c', a: 'left' });
  line(c, '#d1342a', w * 0.022, [w * 0.1, h * 0.41, w * 0.3, h * 0.43, w * 0.62, h * 0.4]);
  (['fix the jump', 'more juice', 'SHIP IT!'] as const).forEach((text, i) => {
    const y = h * (0.58 + i * 0.15);
    c.lineWidth = w * 0.014;
    c.strokeStyle = '#1d2b6b';
    c.strokeRect(w * 0.1, y - h * 0.075, w * 0.085, w * 0.085);
    if (i < 2) line(c, '#d1342a', w * 0.022, [w * 0.105, y - h * 0.04, w * 0.14, y, w * 0.2, y - h * 0.1]);
    type(c, text, w * 0.25, y, w * (i === 2 ? 0.14 : 0.115), i === 2 ? '#d1342a' : '#1d2b6b', { f: 'c', a: 'left' });
  });
};

/** A barcode: bars of hashed widths. */
function barcode(c: Ctx, color: string, seed: number, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color;
  for (let at = 0, i = 0; at < w; i++) {
    const bar = w * (0.012 + 0.03 * rnd(seed, i));
    if (i % 2 === 0) c.fillRect(x + at, y, Math.min(bar, w - at), h);
    at += bar;
  }
}

/** C5 · the ticket stub from the Curfew tour. */
export const ticket: Design = (c, w, h) => {
  rect(c, '#efe3c8', 0, 0, w, h);
  rect(c, '#c9301f', 0, 0, w, h * 0.2);
  type(c, 'ADMIT ONE', w / 2, h * 0.135, w * 0.14, '#efe3c8', { t: 0.08 });
  type(c, 'THE LOUD', w / 2, h * 0.33, w * 0.15, '#16131a');
  type(c, 'HOURS', w / 2, h * 0.44, w * 0.2, '#16131a');
  greek(c, '#16131a', 171, w * 0.12, h * 0.49, w * 0.76, 3, h * 0.03, true);
  type(c, 'ROW 12 · SEAT 7', w / 2, h * 0.66, w * 0.085, '#c9301f', { f: 's' });
  line(c, '#16131a', w * 0.012, [0, h * 0.72, w, h * 0.72], [w * 0.03, w * 0.03]);
  barcode(c, '#16131a', 172, w * 0.12, h * 0.77, w * 0.76, h * 0.13);
  type(c, 'No 004217', w / 2, h * 0.965, w * 0.075, '#16131a', { f: 's' });
};

/** C2 · the boarding pass. */
export const boardingPass: Design = (c, w, h) => {
  rect(c, '#f5f3ee', 0, 0, w, h);
  rect(c, '#1f5fbf', 0, 0, w, h * 0.24);
  type(c, 'BOARDING PASS', w * 0.05, h * 0.17, h * 0.13, '#fff', { a: 'left', t: 0.12 });
  type(c, 'AMS', w * 0.05, h * 0.58, h * 0.2, '#1b1d2a', { a: 'left' });
  type(c, 'NRT', w * 0.7, h * 0.58, h * 0.2, '#1b1d2a', { a: 'right' });
  line(c, '#1f5fbf', h * 0.025, [w * 0.34, h * 0.5, w * 0.42, h * 0.5], [h * 0.04, h * 0.03]);
  poly(c, '#1f5fbf', [w * 0.42, h * 0.43, w * 0.47, h * 0.5, w * 0.42, h * 0.57]);
  greek(c, '#8a8fa3', 181, w * 0.05, h * 0.72, w * 0.62, 2, h * 0.075);
  line(c, '#8a8fa3', h * 0.012, [w * 0.75, h * 0.24, w * 0.75, h], [h * 0.04, h * 0.04]);
  turned(c, w * 0.79, h * 0.94, -Math.PI / 2, () => barcode(c, '#1b1d2a', 182, 0, 0, h * 0.62, w * 0.16));
};

/** C6 · the snapshot: a beach at sundown, in its white frame. */
export const snapshot: Design = (c, w, h) => {
  rect(c, '#f6f4ee', 0, 0, w, h);
  within(c, w * 0.08, w * 0.08, w * 0.84, h * 0.7, () => {
    const [pw, ph] = [w * 0.84, h * 0.7];
    rect(
      c,
      ramp(c, 0, 0, 0, ph, [
        [0, '#3a2a6e'],
        [0.45, '#e2577a'],
        [0.66, '#ffb35a'],
        [0.67, '#274a7a'],
        [1, '#162a4e'],
      ]),
      0,
      0,
      pw,
      ph,
    );
    disc(c, '#fff0b8', pw * 0.36, ph * 0.6, pw * 0.13);
    rect(c, '#274a7a', 0, ph * 0.665, pw, ph * 0.1);
    for (let j = 0; j < 6; j++)
      rect(
        c,
        `rgba(255,220,150,${0.75 - j * 0.11})`,
        pw * (0.3 - j * 0.015),
        ph * (0.69 + j * 0.05),
        pw * (0.12 + j * 0.03),
        ph * 0.02,
      );
    // A palm, leaning in from the right.
    c.lineCap = 'round';
    line(c, '#120a1e', pw * 0.035, [pw * 0.82, ph, pw * 0.76, ph * 0.6, pw * 0.68, ph * 0.3]);
    for (let i = 0; i < 6; i++) {
      const a = -2.9 + i * 0.62;
      c.strokeStyle = '#120a1e';
      c.lineWidth = pw * 0.03;
      c.beginPath();
      c.moveTo(pw * 0.68, ph * 0.3);
      c.quadraticCurveTo(
        pw * 0.68 + Math.cos(a) * pw * 0.16,
        ph * 0.3 + Math.sin(a) * pw * 0.16 - pw * 0.06,
        pw * 0.68 + Math.cos(a) * pw * 0.28,
        ph * 0.3 + Math.sin(a) * pw * 0.2 + pw * 0.06,
      );
      c.stroke();
    }
    c.lineCap = 'butt';
  });
  type(c, 'last day :)', w / 2, h * 0.93, w * 0.12, '#2a2f55', { f: 'c' });
};
