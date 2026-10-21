import type { PixelArtSheet } from '@/engine/gfx/PixelArt';
import { pixels } from '@/engine/gfx/PixelArt';
import { FrameBuilder, flipRows, type Rows, recolorRows } from '../compose';

/**
 * The shared body rig for the three playable characters.
 *
 * Every character is drawn from the same skeleton — legs and arms are shared
 * parts painted with palette keys — and supplies only its own head, torso,
 * palette and props. That keeps all eight animations of all three characters
 * on-model, and lets a crew redraw one piece without touching the rest.
 *
 * Palette keys every character must define:
 *   o outline   s skin   S skin shade   c top   C top shade   l top light
 *   p trousers  P trousers shade   b shoes   B shoe sole
 */
export const CHARACTER_ANIMATIONS = ['idle', 'run', 'jump', 'fall', 'attack', 'skill', 'hurt', 'victory'] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];

export const FRAME = { w: 32, h: 40 } as const;

/** Anchor points in frame pixels; all parts are positioned relative to these. */
const HIP_Y = 31;
const LEGS_X = 10;
const TORSO = { x: 11, y: 21 } as const;
const HEAD = { x: 9, y: 9 } as const;
const FRONT_SHOULDER = { x: 16, y: 22 } as const;
const BACK_SHOULDER = { x: 11, y: 22 } as const;

// ── Legs ──────────────────────────────────────────────────────────────────

const LEGS = {
  stand: pixels(`
    .oPPPpppppo.
    .oPPPpppppo.
    .oPPo.oppo..
    .oPPo.oppo..
    .oPPo.oppo..
    .oPPo.oppo..
    .obbo.obbbo.
    obbbbooobbbo
    oBBBBo.oBBBBo
  `),
  runA: pixels(`
    ..oPPpppppo.
    .oPPPppppppo
    oPPPo.oopppo
    oPPo....oppo
    oPo.....oppo
    obbo....obbo
    obbbo...obbbo
    oBBo....oBBBo
    .oo.........
  `),
  runB: pixels(`
    ..oPPpppppo.
    ..oPPpppppo.
    ...oPPppo...
    ...oPPppo...
    ...oPppo....
    ...oppbbo...
    ...obbbbbo..
    ...oBBBBBo..
    ............
  `),
  runC: pixels(`
    ..oPPpppppo.
    .oppppPPPPo.
    oppo..oPPPo.
    oppo...oPPo.
    oppo....oPo.
    obbbo...obbo
    obbbbo..obbbo
    oBBBBo..oBBo
    ............
  `),
  jump: pixels(`
    ..oPPpppppo.
    .oPPPpppppo.
    .oPPo.opppo.
    oPPo..oppo..
    obbo..oppo..
    obbbo.obbbo.
    .oBBo.obbbbo
    ..oo..oBBBo.
    .......ooo..
  `),
  fall: pixels(`
    ..oPPpppppo.
    .oPPPpppppo.
    .oPPo..oppo.
    .oPPo..oppo.
    oPPo....oppo
    obbbo...obbo
    oBBBo...obbbo
    .ooo....oBBBo
    .........ooo.
  `),
} satisfies Record<string, Rows>;

// ── Arms (sleeve `c`, hand `s`) ──────────────────────────────────────────

const ARMS = {
  down: pixels(`
    .oo.
    occo
    occo
    occo
    occo
    oCCo
    osso
    osso
    .oo.
  `),
  forward: pixels(`
    .oo...
    occo..
    occco.
    .occo.
    .oCCso
    ..osso
    ...oo.
  `),
  back: pixels(`
    ...oo.
    ..occo
    .occo.
    .occo.
    osCCo.
    osso..
    .oo...
  `),
  punch: pixels(`
    .ooo......
    occcoooooo
    occcccCCsso
    .ooccccCsso
    ...ooooooo.
  `),
  windup: pixels(`
    ..oo..
    .occo.
    occo..
    oCCo..
    ossoo.
    .osso.
    ..oo..
  `),
  raise: pixels(`
    ..oo.
    .osso
    .osso
    .oCCo
    .occo
    .occo
    .occo
    occco
    oooo.
  `),
  out: pixels(`
    .ooooo..
    occccCso
    occccCso
    .ooooooo
  `),
} satisfies Record<string, Rows>;

/** The back arm raised on the far side of the head is the mirror image of the front one. */
const BACK_ARMS = { ...ARMS, raise: flipRows(ARMS.raise) } satisfies Record<keyof typeof ARMS, Rows>;

export type LegPose = keyof typeof LEGS;
export type ArmPose = keyof typeof ARMS;

/** How one animation frame is assembled from parts. */
export interface Pose {
  readonly legs: LegPose;
  readonly front: ArmPose;
  readonly back: ArmPose;
  /** Upper-body offset, e.g. the 1 px dip of a breath or a run bob. */
  readonly bodyY?: number;
  readonly bodyX?: number;
  /** Whole-sprite offset, e.g. tucking up during a jump. */
  readonly y?: number;
  readonly face?: Face;
  /** Per-pose arm offsets relative to the shoulder anchors. */
  readonly frontAt?: readonly [number, number];
  readonly backAt?: readonly [number, number];
  /** Extra pixels drawn on top, e.g. stun stars, in frame coordinates. */
  readonly overlay?: { readonly rows: Rows; readonly x: number; readonly y: number };
}

export interface PoseAnimation {
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly Pose[];
  /** Palette-key swaps for the whole animation, e.g. an angry customer calming down. */
  readonly recolor?: Readonly<Record<string, string>>;
}

export type Face = 'normal' | 'blink' | 'hurt' | 'happy' | 'focus' | 'shout';

export const CHARACTER_POSES: Readonly<Record<CharacterAnimation, PoseAnimation>> = {
  idle: {
    fps: 4,
    loop: true,
    frames: [
      { legs: 'stand', front: 'down', back: 'down' },
      { legs: 'stand', front: 'down', back: 'down' },
      { legs: 'stand', front: 'down', back: 'down', bodyY: 1, face: 'blink' },
      { legs: 'stand', front: 'down', back: 'down', bodyY: 1 },
    ],
  },
  run: {
    fps: 12,
    loop: true,
    frames: [
      { legs: 'runA', front: 'forward', back: 'back', bodyY: 0, frontAt: [0, 0], backAt: [-3, 0] },
      { legs: 'runB', front: 'down', back: 'down', bodyY: 1 },
      { legs: 'runC', front: 'back', back: 'forward', bodyY: 0, frontAt: [-3, 0], backAt: [0, 0] },
      { legs: 'runA', front: 'forward', back: 'back', bodyY: 0, frontAt: [0, 0], backAt: [-3, 0] },
      { legs: 'runB', front: 'down', back: 'down', bodyY: 1 },
      { legs: 'runC', front: 'back', back: 'forward', bodyY: 0, frontAt: [-3, 0], backAt: [0, 0] },
    ],
  },
  jump: {
    fps: 8,
    loop: false,
    frames: [
      { legs: 'jump', front: 'raise', back: 'out', y: -1, frontAt: [5, -8], backAt: [-6, 0] },
      { legs: 'jump', front: 'raise', back: 'out', y: -2, frontAt: [5, -8], backAt: [-6, 0] },
    ],
  },
  fall: {
    fps: 8,
    loop: true,
    frames: [
      { legs: 'fall', front: 'out', back: 'out', frontAt: [0, -1], backAt: [-6, -1] },
      { legs: 'fall', front: 'out', back: 'out', frontAt: [0, -2], backAt: [-6, -2] },
    ],
  },
  attack: {
    fps: 14,
    loop: false,
    frames: [
      { legs: 'stand', front: 'windup', back: 'down', bodyX: -1, face: 'focus', frontAt: [-2, 0] },
      { legs: 'stand', front: 'punch', back: 'back', bodyX: 1, face: 'focus', frontAt: [0, 0], backAt: [-2, 0] },
      { legs: 'stand', front: 'punch', back: 'back', bodyX: 1, face: 'focus', frontAt: [0, 0], backAt: [-2, 0] },
      { legs: 'stand', front: 'forward', back: 'down', face: 'focus' },
    ],
  },
  skill: {
    fps: 10,
    loop: false,
    frames: [
      { legs: 'stand', front: 'windup', back: 'down', bodyY: 1, face: 'focus', frontAt: [-2, 0] },
      { legs: 'stand', front: 'raise', back: 'raise', y: -1, face: 'focus', frontAt: [5, -8], backAt: [-6, -8] },
      { legs: 'stand', front: 'raise', back: 'raise', y: -2, face: 'happy', frontAt: [5, -8], backAt: [-6, -8] },
      { legs: 'stand', front: 'out', back: 'out', face: 'happy', frontAt: [0, 0], backAt: [-6, 0] },
    ],
  },
  hurt: {
    fps: 8,
    loop: false,
    frames: [
      {
        legs: 'stand',
        front: 'out',
        back: 'out',
        bodyX: -2,
        bodyY: 1,
        face: 'hurt',
        frontAt: [0, -2],
        backAt: [-6, -2],
      },
      { legs: 'stand', front: 'down', back: 'down', bodyX: -1, face: 'hurt' },
    ],
  },
  victory: {
    fps: 6,
    loop: true,
    frames: [
      { legs: 'stand', front: 'raise', back: 'down', face: 'happy', frontAt: [5, -8] },
      { legs: 'stand', front: 'raise', back: 'down', y: -2, face: 'happy', frontAt: [5, -8] },
      { legs: 'stand', front: 'raise', back: 'down', y: -3, face: 'happy', frontAt: [5, -8] },
      { legs: 'stand', front: 'raise', back: 'down', y: -1, face: 'happy', frontAt: [5, -8] },
    ],
  },
};

/** What a character contributes on top of the shared rig. */
export interface CharacterLook {
  readonly palette: Readonly<Record<string, string>>;
  /** 14 × 13 head per facial expression; missing faces fall back to `normal`. */
  readonly heads: Readonly<Partial<Record<Face, Rows>>> & { readonly normal: Rows };
  /** 10 × 10 torso without arms. */
  readonly torso: Rows;
  /** Props drawn behind the body (a guitar on the back). Positioned relative to the torso. */
  readonly backProp?: { readonly rows: Rows; readonly x: number; readonly y: number };
  /** Props held in the front hand during idle/run (a clipboard), relative to the front shoulder. */
  readonly handProp?: { readonly rows: Rows; readonly x: number; readonly y: number };
}

/** Assembles a playable character's full sheet from its look and the shared poses. */
export function buildCharacterSheet(look: CharacterLook): PixelArtSheet<CharacterAnimation> {
  return buildSheet(look, CHARACTER_POSES);
}

/** Assembles any rig-based sheet (characters, the customer) from a look and a pose table. */
export function buildSheet<A extends string>(
  look: CharacterLook,
  poses: Readonly<Record<A, PoseAnimation>>,
): PixelArtSheet<A> {
  const animations = {} as Record<A, { fps: number; loop: boolean; frames: string[][] }>;
  for (const name of Object.keys(poses) as A[]) {
    const { fps, loop, frames, recolor } = poses[name];
    animations[name] = {
      fps,
      loop,
      frames: frames.map((pose) => {
        const rows = buildFrame(look, pose);
        return recolor ? recolorRows(rows, recolor) : rows;
      }),
    };
  }
  return { palette: look.palette, size: FRAME, animations };
}

function buildFrame(look: CharacterLook, pose: Pose): string[] {
  const frame = new FrameBuilder(FRAME.w, FRAME.h);
  if (pose.overlay) frame.stamp(pose.overlay.rows, pose.overlay.x, pose.overlay.y);
  const y = pose.y ?? 0;
  const bx = pose.bodyX ?? 0;
  const by = y + (pose.bodyY ?? 0);
  const head = look.heads[pose.face ?? 'normal'] ?? look.heads.normal;
  const [frontDx, frontDy] = pose.frontAt ?? [0, 0];
  const [backDx, backDy] = pose.backAt ?? [0, 0];

  // Painter's order, front to back, using `behind` so later layers only fill gaps.
  frame.stamp(ARMS[pose.front], FRONT_SHOULDER.x + bx + frontDx, FRONT_SHOULDER.y + by + frontDy);
  if (look.handProp && (pose.front === 'down' || pose.front === 'forward' || pose.front === 'back')) {
    frame.stamp(
      look.handProp.rows,
      FRONT_SHOULDER.x + bx + frontDx + look.handProp.x,
      FRONT_SHOULDER.y + by + frontDy + look.handProp.y,
      {
        behind: true,
      },
    );
  }
  frame.stamp(head, HEAD.x + bx, HEAD.y + by, { behind: true });
  frame.stamp(look.torso, TORSO.x + bx, TORSO.y + by, { behind: true });
  frame.stamp(LEGS[pose.legs], LEGS_X, HIP_Y + y, { behind: true });
  frame.stamp(BACK_ARMS[pose.back], BACK_SHOULDER.x + bx + backDx, BACK_SHOULDER.y + by + backDy, {
    behind: true,
    recolor: { c: 'C', s: 'S' },
  });
  if (look.backProp) {
    frame.stamp(look.backProp.rows, TORSO.x + bx + look.backProp.x, TORSO.y + by + look.backProp.y, { behind: true });
  }
  return frame.rows();
}
