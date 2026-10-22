import type { Gfx } from '@/engine/gfx/Gfx';
import type { Vec2 } from '@/engine/math/Vec2';
import { lazy } from '../../../../art/logos/lazy';
import { TITLE_LAYOUT } from '../../layout';
import type { TitleBeats } from '../../titleTimeline';
import type { BackdropArt, TitleBackdrop, TitleFrame } from '../TitleBackdrop';
import { drawBadge } from './badge';
import { drawBar, paintBarBody } from './bars';
import { burstFrom, type ConfettiSheet, type Confetto, drawBurst, paintConfettiSheet } from './confetti';
import { drawSpike } from './flare';
import { badgeOpen, cursorLit, idleBarHeight, idleFrame, TAPE_LENGTH, tickerScroll } from './idle';
import { BARS, CHART, SCALE, TICKER } from './layout';
import { INK } from './palette';
import { drawCeiling, drawFrame, drawGlass, drawLiveDot, drawScaleLabel, paintScreen, type Screen } from './screen';
import { barStates, barX, buildTrace, type Trace } from './series';
import { drawTape, paintTape, tapeQuotes } from './ticker';
import {
  AFTERGLOW_FRAMES,
  barRiseStarts,
  beamAt,
  breachSpike,
  burstAge,
  frameAt,
  type GrowthCues,
  glassBoost,
  growthCues,
  headIndex,
  IMPACT_BOOST,
  openingSpike,
  rasterEdge,
  rasterReach,
  risingHeight,
  scaleCount,
  stripLit,
  stripOf,
  type TraceShape,
  tipRise,
} from './timeline';
import { drawHead, drawTraceArt, paintTraceArt, type TraceArt } from './trace';
import { glassLevels, tickRow } from './tube';
import { terminalType } from './type';

/**
 * "Up and to the right" (docs/ART-DIRECTION.md › Title): a 1996 phosphor
 * metrics terminal. A spike of light powers the tube up, the hockey-stick
 * line draws itself through the trough of sorrow, rockets while the words
 * slide in and breaks through the chart's ceiling as they lock, scattering
 * its data points. Settled, the head blinks above the breach as a cursor,
 * the bars tick and a ticker quotes the CV.
 */
export const growthBackdrop: TitleBackdrop<'growth'> = {
  id: 'growth',
  name: 'Up and to the right',
  description:
    "A phosphor metrics terminal whose hockey-stick line breaks through the chart's ceiling as the words lock.",
  prepare: lazy(paintGrowthBackdrop),
};

/**
 * Every glass brightness the choreography steps through, in levels off
 * rest: reduced motion's dim power-up, rest, and a hit's overdrive cooling
 * back down.
 */
const GLASS_BOOSTS = [-4, -2, 0, 1, 2, IMPACT_BOOST] as const;
/** Bars spring past their height as they rise, so their body is painted with room to spare. */
const BAR_HEADROOM = 1.25;

/** Everything painted once. */
interface Terminal {
  readonly screen: Screen;
  /** The hockey stick's pixels and landmarks… */
  readonly trace: Trace;
  readonly shape: TraceShape;
  /** …and the line painted along them in every heat. */
  readonly line: TraceArt;
  readonly barBody: HTMLCanvasElement;
  readonly barStates: readonly (readonly number[])[];
  readonly tape: HTMLCanvasElement;
  readonly confetti: ConfettiSheet;
  readonly bursts: { readonly lively: readonly Confetto[]; readonly calm: readonly Confetto[] };
}

/** The backdrop's beats worked out for one set of the scene's beats. */
interface Choreography {
  readonly beats: TitleBeats;
  readonly cues: GrowthCues;
  /** When each bar starts to rise, which follows the cues. */
  readonly rises: readonly number[];
}

/** The moment being drawn: the intro frame, the cues it plays to and how much motion is welcome. */
interface Moment {
  readonly frame: number;
  readonly cues: GrowthCues;
  /** When each bar starts to rise, which follows the cues. */
  readonly rises: readonly number[];
  readonly reducedMotion: boolean;
  readonly impact: Vec2;
}

/** About 15 ms on a laptop, most of it the glass at its six brightnesses and the line in its four heats. */
function paintGrowthBackdrop(): BackdropArt {
  const { width, height } = TITLE_LAYOUT.screen;
  const levels = glassLevels(width, height);
  const trace = buildTrace();
  const states = barStates();
  const font = terminalType();
  const terminal: Terminal = {
    screen: paintScreen(levels, GLASS_BOOSTS, font, width, height),
    trace,
    shape: { elbow: trace.elbow, last: trace.pixels.length - 1 },
    line: paintTraceArt(trace, width, height, (x, y) => levels[y * width + x] ?? 0),
    barBody: paintBarBody(Math.ceil(Math.max(...states.flat()) * BAR_HEADROOM)),
    barStates: states,
    tape: paintTape(font, tapeQuotes(), TAPE_LENGTH),
    confetti: paintConfettiSheet(),
    bursts: { lively: burstFrom(trace.breach, false), calm: burstFrom(trace.breach, true) },
  };
  const barCenters = (states[0] ?? []).map((_, bar) => barX(bar) + BARS.width / 2);
  // The cues follow the scene's beats, which never change in practice: work them out once per beats object.
  let cached: Choreography | null = null;
  const choreographyFor = (beats: TitleBeats): Choreography => {
    if (cached?.beats !== beats) {
      const cues = growthCues(beats);
      const headX = (frame: number): number => trace.pixels[headIndex(frame, cues, terminal.shape, false)]?.x ?? 0;
      cached = { beats, cues, rises: barRiseStarts(barCenters, headX, cues) };
    }
    return cached;
  };

  return {
    drawBehind(gfx: Gfx, frame: TitleFrame): void {
      const { cues, rises } = choreographyFor(frame.beats);
      const moment: Moment = {
        frame: frameAt(frame.time),
        cues,
        rises,
        reducedMotion: frame.reducedMotion,
        impact: frame.impact,
      };
      drawTube(gfx, terminal, moment);
      drawBars(gfx, terminal, moment);
      drawLine(gfx, terminal, moment);
      drawBreach(gfx, terminal, moment);
      drawOpening(gfx, terminal, moment);
      drawTicker(gfx, terminal, moment);
    },
  };
}

/** The glass, the frame lighting up strip by strip, the ceiling and the counting scale. */
function drawTube(gfx: Gfx, terminal: Terminal, moment: Moment): void {
  const { frame, cues, reducedMotion, impact } = moment;
  const { screen } = terminal;
  drawGlass(gfx, screen, glassBoost(frame, cues, reducedMotion), {
    impactY: impact.y,
    reach: rasterReach(frame, reducedMotion),
    edge: rasterEdge(frame, reducedMotion),
    hot: IMPACT_BOOST,
  });
  const impactStrip = stripOf(impact.y);
  const lit = (strip: number): boolean => stripLit(strip, impactStrip, frame, reducedMotion);
  drawFrame(gfx, screen, lit);
  if (lit(stripOf(CHART.top))) drawCeiling(gfx, burstAge(frame, cues) === null ? null : terminal.trace.breach.x);
  if (lit(stripOf(tickRow(SCALE.steps)))) drawScaleLabel(gfx, screen, scaleCount(frame, cues, SCALE.top));
}

/** The bars spring up behind the line during the intro, then tick through their idle values. */
function drawBars(gfx: Gfx, terminal: Terminal, moment: Moment): void {
  const { frame, cues, rises, reducedMotion } = moment;
  const idle = idleFrame(frame, cues);
  const intro = terminal.barStates[0] ?? [];
  for (let bar = 0; bar < intro.length; bar++) {
    const height =
      idle === null
        ? risingHeight(intro[bar] ?? 0, rises[bar] ?? cues.turn, frame, reducedMotion)
        : idleBarHeight(terminal.barStates, bar, idle, reducedMotion);
    drawBar(gfx, terminal.barBody, barX(bar), height);
  }
}

/** The line up to its head, what the last frames drew still cooling behind it. */
function drawLine(gfx: Gfx, terminal: Terminal, moment: Moment): void {
  const { frame, cues, reducedMotion } = moment;
  const at = (back: number): number => headIndex(frame - back, cues, terminal.shape, reducedMotion);
  const trail = Array.from({ length: AFTERGLOW_FRAMES }, (_, back) => at(back + 1));
  drawTraceArt(gfx, terminal.line, at(0), trail);
}

/**
 * Once the line has broken through: the scattered data points, the head
 * poking through with its cursor, the breach's spike of light and, now
 * and then, the record badge beside the cursor.
 */
function drawBreach(gfx: Gfx, terminal: Terminal, moment: Moment): void {
  const { frame, cues, reducedMotion } = moment;
  const age = burstAge(frame, cues);
  if (age === null) return;
  const { breach } = terminal.trace;
  drawBurst(gfx, terminal.confetti, reducedMotion ? terminal.bursts.calm : terminal.bursts.lively, age);
  drawHead(gfx, breach, tipRise(frame, cues, reducedMotion), cursorLit(frame, cues, reducedMotion));
  const spike = breachSpike(frame, cues, reducedMotion);
  if (spike) drawSpike(gfx, breach.x, breach.y, spike);
  drawBadge(gfx, terminal.screen.font, breach.x - BADGE_GAP, badgeOpen(idleFrame(frame, cues), reducedMotion));
}

/** The badge keeps this far left of the cursor. */
const BADGE_GAP = 6;

/** The opening hit: the spike of light that powers the tube up, then the beam spot flying to where the line starts. */
function drawOpening(gfx: Gfx, terminal: Terminal, moment: Moment): void {
  const { frame, reducedMotion, impact } = moment;
  const spike = openingSpike(frame, reducedMotion);
  if (spike) drawSpike(gfx, impact.x, impact.y, spike);
  const [start] = terminal.trace.pixels;
  if (!start) return;
  // Where it was on the last two frames trails behind it, a step cooler each.
  for (const [back, ink] of BEAM_TRAIL) {
    const beam = beamAt(frame - back, impact, start, reducedMotion);
    if (beam) gfx.fillRect(beam.x - 1, beam.y - 1, 3, 3, ink);
  }
  const beam = beamAt(frame, impact, start, reducedMotion);
  if (!beam) return;
  gfx.fillRect(beam.x - 1, beam.y - 1, 3, 3, INK[4]);
  gfx.pixel(beam.x, beam.y, INK[5]);
}

const BEAM_TRAIL = [
  [2, INK[2]],
  [1, INK[3]],
] as const;

/** The live tag's dot, blinking with the cursor, and once settled the tape scrolling out from under the tag. */
function drawTicker(gfx: Gfx, terminal: Terminal, moment: Moment): void {
  const { frame, cues, reducedMotion, impact } = moment;
  const tagLit = stripLit(stripOf(TICKER.textY), stripOf(impact.y), frame, reducedMotion);
  if (tagLit && cursorLit(frame, cues, reducedMotion)) drawLiveDot(gfx, terminal.screen);
  if (idleFrame(frame, cues) !== null) drawTape(gfx, terminal.tape, tickerScroll(frame, cues, reducedMotion));
}
