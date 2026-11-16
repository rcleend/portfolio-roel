import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { Rect } from '@/engine/math/Rect';
import { easeOutCubic } from '@/engine/motion/easing';
import { defineSkillLook, type FxSheets } from '@/game/art/looks/module';
import type { BurstView } from '@/game/entities/effects/Burst';
import type { CasterSnapshot, FullStackState } from '@/game/skills/SkillVisual';
import { chestLift, drawFrame, frameAt } from '../draw';
import { art as beamArt } from './fx-beam.art';
import beamJson from './fx-beam.json';
import { art as dataArt } from './fx-beam-data.art';
import dataJson from './fx-beam-data.json';
import { art as pierceArt } from './fx-beam-hit.art';
import pierceJson from './fx-beam-hit.json';
import { art as muzzleArt } from './fx-beam-muzzle.art';
import muzzleJson from './fx-beam-muzzle.json';
import { art as tipArt } from './fx-beam-tip.art';
import tipJson from './fx-beam-tip.json';
import { art as bitsArt } from './fx-bits.art';
import bitsJson from './fx-bits.json';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

type Sheets = FxSheets<'beam' | 'data' | 'muzzle' | 'tip' | 'pierce' | 'bits'>;

/** The front reaches the view's edge in five frames; gameplay hits the whole line at once. */
const GROW_FRAMES = 5;
/** The beam collapses over its last nine frames. */
const COLLAPSE_SECONDS = 0.15;
const TILE = 16;
const TILE_HALF_HEIGHT = 14;
const DATA_TILE = 32;
/** Each layer's data, its offset from the beam's centre line and its speed in px per 60 Hz frame: the database is heaviest. */
const DATA_TRACKS = [
  { track: 'front-end', dy: -6, speed: 4 },
  { track: 'back-end', dy: 0, speed: 3 },
  { track: 'database', dy: 6, speed: 2 },
] as const;
/** The tip's chevron point sits this far into its frame. */
const TIP_POINT = 12;
const BIT_GLYPHS = 8;

/**
 * Hibit FULL-STACK ATTACK: the stack fires itself. A three-layer beam
 * (cyan front-end, violet back-end, amber database) opens from the hand in
 * five frames, data glyphs stream through each layer at its own speed, every
 * pierced customer bursts into layer-coloured shards and flying code, and the
 * beam collapses into dashes and dots (docs/looks/hibit-skills.md).
 */
export const look = defineSkillLook('full-stack-attack', {
  icon: { art: iconArt, json: iconJson },
  fx: {
    beam: { art: beamArt, json: beamJson },
    data: { art: dataArt, json: dataJson },
    muzzle: { art: muzzleArt, json: muzzleJson },
    tip: { art: tipArt, json: tipJson },
    pierce: { art: pierceArt, json: pierceJson },
    bits: { art: bitsArt, json: bitsJson },
  },
  visual: (fx) => ({
    active: (gfx, beam, caster, layer, kit) => {
      if (layer !== 'front' || !beam.area || beam.age >= beam.duration) return;
      drawBeam(gfx, fx, beam, beamLine(beam.area, beam.facing, caster), kit.reducedMotion);
    },
    effect: (gfx, effect, kit) => {
      if (effect.role === 'struck') {
        const y = lineY(effect.area, kit.looks.characters.hackerman.sheet.height);
        const skip = kit.reducedMotion ? 1 : 0;
        drawFrame(gfx, fx.pierce, 'pierce', frameAt(effect.burst.age, 30) + skip, effect.burst.x, y, effect.facing < 0);
      } else if (effect.role === 'hit') {
        drawBits(gfx, fx.bits, effect.burst);
      }
    },
  }),
});

/** Where the beam is drawn: from the hand to the view's edge, on the hero's chest line. */
interface BeamLine {
  readonly start: number;
  readonly end: number;
  readonly y: number;
  readonly facing: -1 | 1;
}

function beamLine(area: Rect, facing: -1 | 1, caster: CasterSnapshot): BeamLine {
  return {
    start: Math.round(caster.hand?.x ?? (facing > 0 ? area.x : area.x + area.w)),
    end: Math.round(facing > 0 ? area.x + area.w : area.x),
    y: lineY(area, caster.height),
    facing,
  };
}

/** Gameplay's beam runs at classic's chest height; a taller hero fires it from higher up. */
function lineY(area: Rect, heroHeight: number): number {
  return Math.round(area.y + area.h / 2) - chestLift(heroHeight);
}

function drawBeam(gfx: Gfx, fx: Sheets, beam: FullStackState, line: BeamLine, reduced: boolean): void {
  const frame = frameAt(beam.age, 60);
  const span = Math.abs(line.end - line.start);
  const grown = Math.round(span * easeOutCubic(Math.min(1, (frame + 1) / GROW_FRAMES)));
  const front = line.start + line.facing * grown;
  const collapseAge = beam.age - (beam.duration - COLLAPSE_SECONDS);
  const left = Math.min(line.start, front);
  const tile = tileFrame(frame, collapseAge, beam.age, reduced);

  gfx.withClip(left, line.y - TILE_HALF_HEIGHT, grown, TILE_HALF_HEIGHT * 2, () => {
    for (let offset = 0; offset < grown; offset += TILE) {
      drawFrame(gfx, fx.beam, tile.animation, tile.index, line.start + line.facing * offset, line.y, line.facing < 0);
    }
    if (tile.animation === 'sustain' || (tile.animation === 'open' && tile.index >= 3)) {
      drawData(gfx, fx.data, line, frame, grown, reduced);
    }
  });

  if (frame < GROW_FRAMES) {
    const x = front - line.facing * TIP_POINT + (line.facing < 0 ? 1 : 0);
    drawFrame(gfx, fx.tip, 'grow', frameAt(beam.age, 30) % 3, x, line.y, line.facing < 0);
  }
  drawMuzzle(gfx, fx.muzzle, frame, collapseAge, beam.age, line, reduced);
}

/** Which beam tile plays: `open` while the front grows, `collapse` at the end, `sustain` between. */
function tileFrame(
  frame: number,
  collapseAge: number,
  age: number,
  reduced: boolean,
): { readonly animation: string; readonly index: number } {
  // The steady sustain frame: no crackle, no glow shimmer.
  const steady = { animation: 'sustain', index: 3 };
  if (collapseAge >= 0) return { animation: 'collapse', index: frameAt(collapseAge, 40) };
  if (frame < GROW_FRAMES) return reduced && frame === 3 ? steady : { animation: 'open', index: frame };
  return reduced ? steady : { animation: 'sustain', index: frameAt(age, 20) % 4 };
}

/** Each layer's glyphs scroll at their own speed, starting a little clear of the muzzle. */
function drawData(gfx: Gfx, data: SpriteSheet, line: BeamLine, frame: number, grown: number, reduced: boolean): void {
  for (const { track, dy, speed } of DATA_TRACKS) {
    const scroll = Math.floor((frame * speed) / (reduced ? 2 : 1)) % DATA_TILE;
    for (let offset = 8 - scroll; offset < grown; offset += DATA_TILE) {
      drawFrame(gfx, data, track, 0, line.start + line.facing * offset, line.y + dy, line.facing < 0);
    }
  }
}

function drawMuzzle(
  gfx: Gfx,
  muzzle: SpriteSheet,
  frame: number,
  collapseAge: number,
  age: number,
  line: BeamLine,
  reduced: boolean,
): void {
  const flip = line.facing < 0;
  if (frame < 3) drawFrame(gfx, muzzle, 'charge', frame, line.start, line.y, flip);
  else if (collapseAge >= 0) drawFrame(gfx, muzzle, 'collapse', frameAt(collapseAge, 30), line.start, line.y, flip);
  else drawFrame(gfx, muzzle, 'sustain', reduced ? 0 : frameAt(age, 20) % 4, line.start, line.y, flip);
}

/** Code flies out of every pierced customer: each spark the world rolled becomes a glyph that dims as it goes. */
function drawBits(gfx: Gfx, bits: SpriteSheet, burst: BurstView): void {
  burst.particles.forEach((particle, index) => {
    if (particle.age >= particle.life) return;
    const row = particle.age < particle.life * 0.6 ? 'bright' : 'dim';
    drawFrame(gfx, bits, row, index % BIT_GLYPHS, particle.x, particle.y);
  });
}
