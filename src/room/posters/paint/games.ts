import {
  burst,
  type Ctx,
  type Design,
  disc,
  glow,
  greek,
  line,
  noise1,
  pixels,
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
 * The games on the walls. Three are the room's own shelf (gen/artPaint.ts: Powder Rush, Crown & Key, Brick Galaxy) as
 * the shop gave their posters away; the rest are as fictional: a rhythm game, a stealth game, an online world, a
 * teaser for something called Eclipse Protocol. No real game's art, name or mark is drawn here.
 */

/** A slanted, outlined title, as on the shelf's covers. */
function title(c: Ctx, lines: readonly string[], x: number, y: number, size: number, fill: string, edge: string): void {
  c.save();
  c.translate(x, y);
  c.transform(1, -0.07, -0.16, 1, 0, 0);
  lines.forEach((text, i) => {
    type(c, text, 0, i * size * 0.92, size, fill, { o: edge, ow: 0.2 });
  });
  c.restore();
}

/** R1 · a home print of a screenshot: dusk over a keep, in fat pixels. */
export const keepAtDusk: Design = (c, w, h) => {
  rect(c, '#efeee9', 0, 0, w, h);
  const margin = w * 0.025;
  const px = (w - 2 * margin) / 118;
  const rows = Math.floor((h - 2 * margin) / px);
  within(c, margin, (h - rows * px) / 2, 118 * px, rows * px, () => {
    c.scale(px, px);
    // The sky in dithered bands.
    const bands = ['#221a45', '#3a2260', '#6a2c6f', '#a8436b', '#dd6f5a', '#f2a65a', '#f7d37a'];
    const sky = rows * 0.62;
    bands.forEach((color, i) => {
      const y0 = Math.floor((i * sky) / bands.length);
      const y1 = Math.floor(((i + 1) * sky) / bands.length);
      rect(c, color, 0, y0, 118, y1 - y0 + 1);
      const next = bands[i + 1];
      if (next) for (let x = 0; x < 118; x += 2) rect(c, next, x + (i % 2), y1 - 1, 1, 1);
      if (next) for (let x = 0; x < 118; x += 4) rect(c, next, x + ((i * 2) % 4), y1 - 2, 1, 1);
    });
    for (let i = 0; i < 26; i++)
      rect(c, '#f7efd0', Math.floor(rnd(3, i) * 118), Math.floor(rnd(4, i) * sky * 0.5), 1, 1);
    // The moon, two ranges, the keep on its hill.
    for (let y = -7; y <= 7; y++) {
      const half = Math.floor(Math.sqrt(56 - y * y));
      rect(c, '#fbf3d5', 86 - half, 13 + y, half * 2 + 1, 1);
    }
    rect(c, '#e6d6a8', 83, 10, 3, 2);
    rect(c, '#e6d6a8', 89, 15, 2, 2);
    const column = (color: string, seed: number, base: number, amp: number, scale: number): void => {
      c.fillStyle = color;
      for (let x = 0; x < 118; x++) {
        const top = Math.floor(base - noise1(seed, x / scale) * amp - noise1(seed + 1, x / 3) * 1.5);
        c.fillRect(x, top, 1, rows - top);
      }
    };
    column('#5d2a63', 5, sky - 2, 14, 16);
    column('#34204f', 6, sky + 3, 9, 9);
    const hill = (x: number): number => Math.floor(sky + 9 - 13 * Math.exp(-(((x - 40) / 22) ** 2)));
    c.fillStyle = '#15102a';
    for (let x = 0; x < 118; x++) c.fillRect(x, hill(x), 1, rows);
    pixels(
      c,
      28,
      hill(40) - 19,
      1,
      [
        '    #       #       #    ',
        '   ###     ###     ###   ',
        '   ###     # #     ###   ',
        '  #####   #####   #####  ',
        '  # # #   #####   # # #  ',
        '  #####   #####   #####  ',
        '  #o###   ##o##   ###o#  ',
        '  #####   #####   #####  ',
        '  ##### # ##### # #####  ',
        '  ##################### ',
        '  ###o#####o###o#####o## ',
        '  ###################### ',
        '  #########   ########## ',
        '  ########  o  ######### ',
        '  ########     ######### ',
        ' ######################## ',
        ' ######################## ',
        '##########################',
        '##########################',
        '##########################',
      ],
      { '#': '#15102a', o: '#f7b54a' },
    );
    // The lake, with the moon's path, and pines in front.
    const shore = Math.floor(sky + 12);
    rect(c, '#2b2a5c', 0, shore, 118, rows - shore);
    for (let y = shore + 1; y < rows; y += 2) {
      const half = 2 + Math.floor(rnd(8, y) * 5) + (y - shore) / 2;
      rect(c, '#f2a65a', 86 - half, y, half * 2, 1);
      rect(c, '#494a86', Math.floor(rnd(9, y) * 60), y, 6 + Math.floor(rnd(10, y) * 12), 1);
    }
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rnd(11, i) * 112) + 3;
      const tall = 9 + Math.floor(rnd(12, i) * 10);
      for (let y = 0; y < tall; y++) {
        const half = Math.floor((y % 4) / 2 + (y / tall) * 3.5);
        rect(c, '#0b0817', x - half, rows - tall + y, half * 2 + 1, 1);
      }
    }
  });
};

/** R2 · the online world's logo, printed and cut out. */
export const mosskeep: Design = (c, w, h) => {
  rect(c, '#efeee9', 0, 0, w, h);
  type(c, 'MOSSKEEP', w / 2 + w * 0.008, h * 0.6 + w * 0.01, w * 0.125, '#2c4a1e', { f: 's' });
  type(c, 'MOSSKEEP', w / 2, h * 0.6, w * 0.125, '#5f9b3a', { f: 's' });
  c.save();
  c.beginPath();
  c.rect(0, h * 0.2, w, h * 0.2);
  c.clip();
  type(c, 'MOSSKEEP', w / 2, h * 0.6, w * 0.125, '#9fd36a', { f: 's' });
  c.restore();
  poly(c, '#7a1f1c', [
    w * 0.3,
    h * 0.7,
    w * 0.7,
    h * 0.7,
    w * 0.68,
    h * 0.8,
    w * 0.7,
    h * 0.9,
    w * 0.3,
    h * 0.9,
    w * 0.32,
    h * 0.8,
  ]);
  type(c, 'ONLINE', w / 2, h * 0.865, w * 0.045, '#f3e3b5', { f: 's', t: 0.4 });
};

/** F1 · the rhythm game's pull-out: a highway of notes running to a white-hot horizon. */
export const encore: Design = (c, w, h) => {
  rect(
    c,
    ramp(c, 0, 0, 0, h, [
      [0, '#12062b'],
      [0.45, '#3b0f5c'],
      [1, '#0a0418'],
    ]),
    0,
    0,
    w,
    h,
  );
  const [vx, vy] = [w * 0.5, h * 0.4];
  stars(c, 14, 70, w, h * 0.5, 'rgba(255,255,255,0.7)', w * 0.003);
  c.globalCompositeOperation = 'lighter';
  burst(c, 'rgba(255,90,200,0.14)', vx, vy, 0, w, 18, 0.1);
  disc(
    c,
    glow(c, vx, vy, w * 0.42, [
      [0, '#fff'],
      [0.12, 'rgba(255,220,120,0.9)'],
      [0.45, 'rgba(255,60,170,0.35)'],
      [1, 'rgba(255,60,170,0)'],
    ]),
    vx,
    vy,
    w * 0.42,
  );
  c.globalCompositeOperation = 'source-over';
  // The highway: four lanes from the horizon to the bottom edge.
  const lanes = ['#36d6c8', '#ff4fa3', '#ffd23f', '#9be33b'];
  const edge = (lane: number, t: number): number => vx + (lane - 2) * w * (0.012 + 0.2 * t);
  const depth = (t: number): number => vy + (h - vy) * t;
  poly(c, 'rgba(8,4,20,0.82)', [edge(0, 0), vy, edge(4, 0), vy, edge(4, 1.1), depth(1.1), edge(0, 1.1), depth(1.1)]);
  for (let lane = 0; lane <= 4; lane++) {
    line(c, lane % 4 ? 'rgba(255,255,255,0.35)' : '#fff', w * 0.006, [edge(lane, 0), vy, edge(lane, 1.1), depth(1.1)]);
  }
  for (let i = 1; i < 9; i++) {
    const t = (i / 9) ** 2.2;
    line(c, 'rgba(255,255,255,0.3)', w * 0.003, [edge(0, t), depth(t), edge(4, t), depth(t)]);
  }
  for (let i = 0; i < 13; i++) {
    const lane = Math.floor(rnd(15, i) * 4);
    const t = (0.12 + (i / 13) * 0.86) ** 1.8;
    const x = (edge(lane, t) + edge(lane + 1, t)) / 2;
    const r = w * (0.006 + 0.07 * t);
    c.save();
    c.translate(x, depth(t));
    c.scale(1, 0.5);
    disc(c, '#0a0418', 0, r * 0.25, r * 1.08);
    disc(c, lanes[lane] as string, 0, 0, r);
    disc(c, '#fff', 0, -r * 0.1, r * 0.45);
    c.restore();
  }
  turned(c, w * 0.5, h * 0.2, -0.05, () => {
    type(c, 'ENCORE!', 0, 0, w * 0.2, '#ffd23f', { f: 'c', o: '#c2187f', ow: 0.22 });
    type(c, 'ENCORE!', 0, 0, w * 0.2, '#ffd23f', { f: 'c', o: '#2a0845', ow: 0.08 });
  });
  type(c, 'ROCK THE LIVING ROOM', w / 2, h * 0.3, w * 0.036, '#fff', { t: 0.34 });
  rect(c, '#ff4fa3', w * 0.04, h * 0.9, w * 0.2, h * 0.06);
  type(c, 'POSTER', w * 0.14, h * 0.945, w * 0.034, '#12062b', { t: 0.2 });
};

/** B3 · the shop's poster for Powder Rush: a rider off a cornice, the mountain all diagonals. */
export const powderRush: Design = (c, w, h) => {
  rect(
    c,
    ramp(c, 0, 0, 0, h, [
      [0, '#1a4fb4'],
      [0.55, '#5aa7e6'],
      [1, '#cfeaff'],
    ]),
    0,
    0,
    w,
    h,
  );
  disc(
    c,
    glow(c, w * 0.8, h * 0.2, w * 0.4, [
      [0, '#fff'],
      [0.15, 'rgba(255,255,255,0.75)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    w * 0.8,
    h * 0.2,
    w * 0.4,
  );
  ridge(c, '#7fb2e6', 51, 0, w, h * 0.55, h * 0.13, w * 0.3, h);
  ridge(c, '#a9cdf0', 52, 0, w, h * 0.63, h * 0.06, w * 0.16, h);
  // The slope, lit and in shadow, and the cornice the rider left.
  poly(c, '#fff', [0, h * 0.5, w * 0.36, h * 0.62, w, h * 0.96, w, h, 0, h]);
  poly(c, '#b8d6f2', [0, h * 0.62, w * 0.42, h * 0.8, w * 0.75, h, 0, h]);
  poly(c, '#8fb9e4', [0, h * 0.78, w * 0.3, h * 0.92, w * 0.42, h, 0, h]);
  // Spray, thrown back along the take-off.
  c.fillStyle = '#fff';
  c.beginPath();
  for (let i = 0; i < 90; i++) {
    const t = rnd(53, i);
    const x = w * (0.2 + 0.36 * t) + (rnd(54, i) - 0.5) * w * 0.1 * t;
    const y = h * (0.6 - 0.17 * Math.sin(t * Math.PI * 0.9)) + (rnd(55, i) - 0.5) * h * 0.09;
    const r = w * (0.004 + 0.016 * rnd(56, i) * (1 - t));
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, 2 * Math.PI);
  }
  c.fill();
  // The rider, grabbing the board.
  turned(c, w * 0.6, h * 0.42, -0.42, () => {
    const u = w * 0.01;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    line(c, '#12224f', u * 2.6, [-u * 13, u * 9, u * 13, u * 9]);
    line(c, '#f5c400', u * 1.1, [-u * 13, u * 9, u * 13, u * 9]);
    line(c, '#e8352b', u * 3.4, [-u * 5, u * 8, -u * 3, u * 2.5, u * 1.5, -u * 1, u * 5, u * 2.5, u * 5.5, u * 8]);
    line(c, '#12224f', u * 4.4, [-u * 1, u * 1, u * 1, -u * 6]);
    line(c, '#12224f', u * 2.2, [u * 0.5, -u * 5, -u * 6, -u * 9.5]);
    line(c, '#12224f', u * 2.2, [u * 1, -u * 5, u * 3.5, u * 1, u * 2.5, u * 7.5]);
    disc(c, '#f5c400', u * 2.3, -u * 9, u * 2.7);
    rect(c, '#12224f', u * 1.6, -u * 10.2, u * 3.6, u * 1.7);
    c.lineCap = 'butt';
  });
  title(c, ['POWDER', 'RUSH'], w * 0.4, h * 0.16, w * 0.17, '#fff', '#12307a');
  burst(c, '#e8352b', w * 0.18, h * 0.86, w * 0.09, w * 0.125, 12);
  disc(c, '#e8352b', w * 0.18, h * 0.86, w * 0.1);
  type(c, 'OUT', w * 0.18, h * 0.855, w * 0.062, '#fff');
  type(c, 'NOW', w * 0.18, h * 0.915, w * 0.062, '#fff');
};

/** O1 · the shop's poster for Crown & Key: the two of them in gold over a sleeping keep. */
export const crownAndKey: Design = (c, w, h) => {
  rect(
    c,
    ramp(c, 0, 0, 0, h, [
      [0, '#140b33'],
      [0.6, '#33186b'],
      [1, '#5a2a7a'],
    ]),
    0,
    0,
    w,
    h,
  );
  const cx = w * 0.5;
  c.globalCompositeOperation = 'lighter';
  burst(c, 'rgba(240,190,90,0.1)', cx, h * 0.4, 0, w, 20);
  disc(
    c,
    glow(c, cx, h * 0.4, w * 0.4, [
      [0, 'rgba(255,220,140,0.55)'],
      [1, 'rgba(255,200,120,0)'],
    ]),
    cx,
    h * 0.4,
    w * 0.4,
  );
  c.globalCompositeOperation = 'source-over';
  stars(c, 61, 60, w, h * 0.7, 'rgba(255,240,210,0.8)', w * 0.003);
  ridge(c, '#1c0f3f', 62, 0, w, h * 0.78, h * 0.07, w * 0.2, h);
  ridge(c, '#0d0720', 63, 0, w, h * 0.87, h * 0.04, w * 0.12, h);
  const gold = ramp(c, 0, h * 0.14, 0, h * 0.7, [
    [0, '#fff0b0'],
    [0.5, '#f0b93a'],
    [1, '#a8661a'],
  ]);
  // The crown: a band, five points, a jewel on each.
  const [top, band, half] = [h * 0.16, h * 0.3, w * 0.17];
  const points = [cx - half, band];
  for (let i = 0; i <= 4; i++) {
    const x = cx - half + (i / 4) * half * 2;
    points.push(x, top + (i % 2 ? h * 0.035 : 0));
    if (i < 4) points.push(x + half / 4, band - h * 0.05);
  }
  points.push(cx + half, band);
  poly(c, gold, points);
  rect(c, gold, cx - half, band - 1, half * 2, h * 0.05);
  rect(c, '#7a3d0c', cx - half, band + h * 0.035, half * 2, h * 0.006);
  for (let i = 0; i <= 4; i++) {
    disc(c, i % 2 ? '#56c2ff' : '#ff4b6a', cx - half + (i / 4) * half * 2, top + (i % 2 ? h * 0.035 : 0), w * 0.016);
    disc(c, i % 2 ? '#ff4b6a' : '#56c2ff', cx - half * 0.8 + (i / 4) * half * 1.6, band + h * 0.016, w * 0.012);
  }
  // The key: a bow, a stem, two wards.
  c.lineCap = 'round';
  ring(c, gold, w * 0.03, cx, h * 0.435, w * 0.052);
  line(c, gold, w * 0.03, [cx, h * 0.495, cx, h * 0.7]);
  line(c, gold, w * 0.026, [cx, h * 0.69, cx + w * 0.07, h * 0.69]);
  line(c, gold, w * 0.026, [cx, h * 0.635, cx + w * 0.05, h * 0.635]);
  c.lineCap = 'butt';
  type(c, 'CROWN & KEY', cx, h * 0.86, w * 0.105, '#ffe9a8', { t: 0.08, o: '#27135e', ow: 0.18, max: w * 0.9 });
  type(c, 'EVERY DOOR HAS A PRICE', cx, h * 0.93, w * 0.034, '#d9c8ff', { t: 0.3 });
  greek(c, 'rgba(217,200,255,0.5)', 64, w * 0.3, h * 0.955, w * 0.4, 1, h * 0.016, true);
};

/** E1 · the stealth game's glossy print: one mast on a ridge, seen through a night scope. */
export const quietSector: Design = (c, w, h) => {
  rect(
    c,
    ramp(c, 0, 0, 0, h, [
      [0, '#03120c'],
      [0.6, '#0b3320'],
      [1, '#020a06'],
    ]),
    0,
    0,
    w,
    h,
  );
  disc(
    c,
    glow(c, w * 0.66, h * 0.44, w * 0.5, [
      [0, 'rgba(90,255,150,0.42)'],
      [1, 'rgba(90,255,150,0)'],
    ]),
    w * 0.66,
    h * 0.44,
    w * 0.5,
  );
  stars(c, 71, 50, w, h * 0.5, 'rgba(160,255,190,0.6)', w * 0.0028);
  ridge(c, '#0a2a1a', 72, 0, w, h * 0.62, h * 0.07, w * 0.25, h);
  // The searchlight, then the mast it sweeps from.
  const [mx, my] = [w * 0.3, h * 0.3];
  poly(
    c,
    ramp(c, mx, my, w, h * 0.6, [
      [0, 'rgba(150,255,180,0.5)'],
      [1, 'rgba(150,255,180,0)'],
    ]),
    [mx, my, w * 1.05, h * 0.42, w * 1.05, h * 0.74],
  );
  ridge(c, '#020a06', 73, 0, w, h * 0.74, h * 0.06, w * 0.18, h);
  line(c, '#020a06', w * 0.008, [mx - w * 0.03, h * 0.72, mx, my, mx + w * 0.03, h * 0.72]);
  for (let i = 1; i < 6; i++) {
    const y = my + ((h * 0.42) / 6) * i;
    const half = (w * 0.03 * i) / 6;
    line(c, '#020a06', w * 0.004, [mx - half, y, mx + half, y + (h * 0.42) / 6, mx - half * 1.2, y + (h * 0.42) / 6]);
  }
  disc(c, '#ff3b30', mx, my - h * 0.01, w * 0.009);
  disc(
    c,
    glow(c, mx, my - h * 0.01, w * 0.05, [
      [0, 'rgba(255,60,48,0.7)'],
      [1, 'rgba(255,60,48,0)'],
    ]),
    mx,
    my - h * 0.01,
    w * 0.05,
  );
  // Scan lines and the scope's furniture.
  c.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += h / 60) c.fillRect(0, y, w, h / 150);
  const GREEN = '#7dffa6';
  const [rx, ry, rr] = [w * 0.66, h * 0.44, h * 0.17];
  ring(c, GREEN, w * 0.004, rx, ry, rr);
  ring(c, 'rgba(125,255,166,0.5)', w * 0.002, rx, ry, rr * 0.5);
  line(c, GREEN, w * 0.003, [rx - rr * 1.35, ry, rx - rr * 0.3, ry]);
  line(c, GREEN, w * 0.003, [rx + rr * 0.3, ry, rx + rr * 1.35, ry]);
  line(c, GREEN, w * 0.003, [rx, ry - rr * 1.35, rx, ry - rr * 0.3]);
  line(c, GREEN, w * 0.003, [rx, ry + rr * 0.3, rx, ry + rr * 1.35]);
  const m = w * 0.04;
  for (const [x, y, sx, sy] of [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ] as const) {
    line(c, GREEN, w * 0.005, [x, y + sy * m, x, y, x + sx * m, y]);
  }
  type(c, 'REC', w * 0.9, h * 0.135, w * 0.03, GREEN, { f: 's', a: 'right' });
  disc(c, '#ff3b30', w * 0.81, h * 0.118, w * 0.01);
  type(c, 'QUIET SECTOR', w * 0.075, h * 0.87, w * 0.082, GREEN, { f: 's', a: 'left' });
  type(c, 'NOBODY SAW YOU ARRIVE', w * 0.078, h * 0.925, w * 0.026, 'rgba(125,255,166,0.75)', {
    f: 's',
    a: 'left',
    t: 0.1,
  });
};

/** A toy brick seen from the front: its face, a lit top edge, studs. */
function brick(c: Ctx, x: number, y: number, studs: number, u: number, color: string): void {
  rect(c, color, x, y, studs * u, u * 1.2);
  rect(c, 'rgba(255,255,255,0.3)', x, y, studs * u, u * 0.16);
  rect(c, 'rgba(0,0,0,0.25)', x, y + u * 1.06, studs * u, u * 0.14);
  for (let i = 0; i < studs; i++) rect(c, color, x + (i + 0.2) * u, y - u * 0.26, u * 0.6, u * 0.3);
}

/** E2 · the shop's poster for Brick Galaxy: a rocket of bricks, mid-launch. */
export const brickGalaxy: Design = (c, w, h) => {
  rect(
    c,
    ramp(c, 0, 0, 0, h, [
      [0, '#070b2e'],
      [0.7, '#152a7c'],
      [1, '#2a4bb8'],
    ]),
    0,
    0,
    w,
    h,
  );
  stars(c, 81, 110, w, h, '#fff', w * 0.0035);
  // A planet of plates, with a ring.
  const [px, py, pr] = [w * 0.8, h * 0.74, w * 0.2];
  const plate = pr / 6;
  for (let j = -6; j < 6; j++) {
    const half = Math.round(Math.sqrt(36 - (j + 0.5) ** 2));
    rect(
      c,
      ['#f08a24', '#f5a742', '#e06a1a'][(j + 6) % 3] as string,
      px - half * plate,
      py + j * plate,
      half * 2 * plate,
      plate + 0.3,
    );
  }
  turned(c, px, py, -0.35, () => {
    c.scale(1, 0.24);
    ring(c, '#ffe08a', w * 0.022, 0, 0, pr * 1.55);
  });
  // The rocket, climbing to the upper left on a tail of flame bricks.
  turned(c, w * 0.44, h * 0.5, -0.5, () => {
    const u = w * 0.05;
    const flame = ['#ffd23f', '#ff9a1f', '#ff5a1f', '#ffd23f'];
    flame.forEach((color, i) => {
      brick(c, -u * (1.5 - i * 0.25) + (i % 2) * u * 0.2, u * (4.6 + i * 1.25), 3 - Math.floor(i / 2), u, color);
    });
    brick(c, -u * 3, u * 3.3, 1, u, '#e3262c');
    brick(c, u * 2, u * 3.3, 1, u, '#e3262c');
    brick(c, -u * 2, u * 3.3, 4, u, '#e3262c');
    brick(c, -u * 2, u * 2.1, 4, u, '#f4f4f0');
    brick(c, -u * 2, u * 0.9, 4, u, '#f4f4f0');
    brick(c, -u * 2, -u * 0.3, 4, u, '#ffd23f');
    brick(c, -u * 2, -u * 1.5, 4, u, '#f4f4f0');
    brick(c, -u * 1.5, -u * 2.7, 3, u, '#e3262c');
    brick(c, -u, -u * 3.9, 2, u, '#e3262c');
    brick(c, -u * 0.5, -u * 5.1, 1, u, '#e3262c');
    disc(c, '#16307a', 0, u * 1.2, u * 0.95);
    disc(c, '#8fd4ff', 0, u * 1.2, u * 0.7);
    disc(c, '#fff', -u * 0.22, u * 0.98, u * 0.2);
  });
  turned(c, w / 2, h * 0.11, -0.04, () => {
    type(c, 'BRICK', 0, 0, w * 0.2, '#ffd400', { f: 'c', o: '#5a3a00', ow: 0.2 });
    type(c, 'GALAXY', 0, w * 0.165, w * 0.2, '#ffd400', { f: 'c', o: '#5a3a00', ow: 0.2 });
  });
  rect(c, '#e3262c', 0, h * 0.905, w, h * 0.06);
  type(c, 'THE BUILD-IT-YOURSELF SAGA', w / 2, h * 0.948, w * 0.042, '#fff', { t: 0.1 });
};

/** M6 · the sticker: a small robot, die-cut square with a white edge. */
export const botSticker: Design = (c, w, h) => {
  rect(c, '#f4f2ec', 0, 0, w, h);
  const m = w * 0.07;
  rect(c, '#19b5a5', m, m, w - 2 * m, h - 2 * m);
  const px = (w - 2 * m) / 12;
  pixels(
    c,
    m + px,
    m + px * 0.8,
    px,
    [
      '    #  #  ',
      '    #  #  ',
      ' ######## ',
      ' #wwwwww# ',
      ' #wkwwkw# ',
      ' #wwwwww# ',
      '##wkkkkw##',
      ' #wwwwww# ',
      ' ######## ',
      '  ##  ##  ',
    ],
    { '#': '#0d2b33', w: '#fdf6d8', k: '#ff5b4a' },
  );
};

/** O2 · a home print: the save icon and the one rule. */
export const saveOften: Design = (c, w, h) => {
  rect(c, '#f1eee6', 0, 0, w, h);
  const px = w / 46;
  const x0 = (w - 20 * px) / 2;
  rect(c, 'rgba(0,0,0,0.12)', x0 + px, h * 0.1 + px, 20 * px, 20 * px);
  pixels(
    c,
    x0,
    h * 0.1,
    px,
    [
      'bbbbbbbbbbbbbbbbbbb ',
      'bbwwwwwwwwwwwwssbbbb',
      'bbwwwwwwwwwwwwssbbbb',
      'bbwwwwwwwwwwwwssbbbb',
      'bbwwwwwwwwwwwwssbbbb',
      'bbwwwwwwwwwwwwwwbbbb',
      'bbbbbbbbbbbbbbbbbbbb',
      'bbbbbbbbbbbbbbbbbbbb',
      'bbbbbbbbbbbbbbbbbbbb',
      'bbllllllllllllllllbb',
      'bbllllllllllllllllbb',
      'bbllrrrrrrrrrrrrllbb',
      'bbllllllllllllllllbb',
      'bbllggggggggggggllbb',
      'bbllllllllllllllllbb',
      'bbllggggggggglllllbb',
      'bbllllllllllllllllbb',
      'bbllllllllllllllllbb',
      'bbllllllllllllllllbb',
      'bbbbbbbbbbbbbbbbbbbb',
    ],
    { b: '#2546c8', w: '#c9ced8', s: '#2546c8', l: '#fbfaf5', r: '#e8352b', g: '#9aa3b5' },
  );
  type(c, 'SAVE', w / 2, h * 0.72, w * 0.2, '#15151c', { f: 's' });
  type(c, 'OFTEN.', w / 2, h * 0.87, w * 0.2, '#15151c', { f: 's' });
  rect(c, '#e8352b', w * 0.14, h * 0.905, w * 0.72, h * 0.012);
  type(c, 'CTRL + S', w / 2, h * 0.955, w * 0.04, '#2546c8', { f: 's', t: 0.3 });
};

/** S3 · the teaser one-sheet: an eclipse, a name, a year. */
export const eclipseProtocol: Design = (c, w, h) => {
  rect(c, '#050307', 0, 0, w, h);
  const [ex, ey, er] = [w * 0.5, h * 0.36, w * 0.25];
  c.globalCompositeOperation = 'lighter';
  disc(
    c,
    glow(c, ex, ey, er * 2.4, [
      [0.38, 'rgba(255,70,30,0)'],
      [0.42, 'rgba(255,120,50,0.95)'],
      [0.5, 'rgba(230,40,30,0.5)'],
      [1, 'rgba(160,20,40,0)'],
    ]),
    ex,
    ey,
    er * 2.4,
  );
  burst(c, 'rgba(255,90,50,0.1)', ex, ey, er, er * 2.6, 40, 0.3);
  // The light it throws on the water below, and the diamond at its edge.
  rect(
    c,
    ramp(c, 0, h * 0.6, 0, h * 0.9, [
      [0, 'rgba(255,90,50,0.55)'],
      [1, 'rgba(255,90,50,0)'],
    ]),
    ex - w * 0.012,
    h * 0.6,
    w * 0.024,
    h * 0.3,
  );
  rect(
    c,
    ramp(c, 0, 0, w, 0, [
      [0.05, 'rgba(255,70,40,0)'],
      [0.5, 'rgba(255,120,70,0.9)'],
      [0.95, 'rgba(255,70,40,0)'],
    ]),
    0,
    h * 0.6,
    w,
    h * 0.004,
  );
  const [dx, dy] = [ex + er * 0.72, ey - er * 0.72];
  disc(
    c,
    glow(c, dx, dy, er * 0.5, [
      [0, '#fff'],
      [0.2, 'rgba(255,220,180,0.8)'],
      [1, 'rgba(255,120,60,0)'],
    ]),
    dx,
    dy,
    er * 0.5,
  );
  c.globalCompositeOperation = 'source-over';
  disc(c, '#050307', ex, ey, er);
  for (let i = 0; i < 26; i++) {
    const y = h * (0.615 + 0.011 * i);
    const half = w * (0.02 + 0.014 * i) * (0.5 + rnd(91, i));
    rect(
      c,
      `rgba(255,${90 + i * 2},60,${0.5 - i * 0.017})`,
      ex - half + (rnd(92, i) - 0.5) * w * 0.03,
      y,
      half * 2,
      h * 0.003,
    );
  }
  type(c, 'ECLIPSE', w / 2, h * 0.79, w * 0.115, '#f3ebe6', { t: 0.34, wt: 600 });
  type(c, 'PROTOCOL', w / 2, h * 0.84, w * 0.04, '#ff5a36', { t: 0.9 });
  type(c, '2008', w / 2, h * 0.945, w * 0.034, 'rgba(243,235,230,0.7)', { t: 0.5 });
  greek(c, 'rgba(243,235,230,0.3)', 93, w * 0.3, h * 0.9, w * 0.4, 1, h * 0.012, true);
};
