import { applyAutomation, envelopeLength, envelopePoints } from './envelope';
import type { Patch, Waveform } from './patch';
import { midiToHz } from './pitch';
import { pitchPoints, type VoiceNote } from './voiceNote';
import { noiseBuffer, pulseWave } from './waves';

/** Seconds the sources keep running after the envelope reaches zero, so nothing is cut mid-sample. */
const STOP_MARGIN = 0.02;
/** Vibrato fades in over this long once its delay has passed, rather than switching on. */
const VIBRATO_FADE_IN = 0.15;

/**
 * Plays one note of `patch` into `destination` on the audio clock and returns
 * the context time at which it has fully finished. Every node is created for
 * this note alone and released when it ends, so voices never need to be
 * managed or reused.
 *
 *   sources (oscillators / noise) → [filter] → amp (envelope) → [panner] → destination
 *   pitch bus (cents, + vibrato) → every source's detune
 */
export function playVoice(context: BaseAudioContext, destination: AudioNode, patch: Patch, note: VoiceNote): number {
  const start = note.time;
  const end = start + envelopeLength(patch.env, note.hold) + STOP_MARGIN;

  const pitch = context.createConstantSource();
  pitch.offset.value = 0;
  applyAutomation(pitch.offset, pitchPoints(patch, note));
  const scheduled: AudioScheduledSourceNode[] = [pitch];
  if (patch.vibrato) scheduled.push(addVibrato(context, pitch.offset, patch.vibrato, start));

  const tones = note.chord && note.chord.length > 0 ? note.chord : [0];
  const spread = patch.unison && patch.wave.type !== 'noise' ? [-patch.unison / 2, patch.unison / 2] : [0];
  const sourceCount = tones.length * spread.length;

  const amp = context.createGain();
  amp.gain.value = 0;
  const peak = ((patch.gain ?? 1) * (note.velocity ?? 1)) / Math.sqrt(sourceCount);
  applyAutomation(amp.gain, envelopePoints(patch.env, peak, start, note.hold));

  const input = patch.filter ? addFilter(context, amp, patch.filter, start) : amp;
  for (const tone of tones) {
    for (const cents of spread) {
      const source = createSource(context, patch.wave, note.midi + tone, cents, pitch, start, end);
      source.output.connect(input);
      scheduled.push(...source.nodes);
    }
  }

  let tail: AudioNode = amp;
  if (patch.pan) {
    const panner = context.createStereoPanner();
    panner.pan.value = patch.pan;
    amp.connect(panner);
    tail = panner;
  }
  tail.connect(destination);

  for (const node of scheduled) {
    node.start(start);
    node.stop(end);
  }
  // Detach from the shared bus once silent so the finished graph can be collected.
  pitch.onended = () => tail.disconnect();
  return end;
}

interface Source {
  readonly output: AudioNode;
  readonly nodes: readonly AudioScheduledSourceNode[];
}

function createSource(
  context: BaseAudioContext,
  wave: Waveform,
  midi: number,
  detune: number,
  pitch: ConstantSourceNode,
  start: number,
  end: number,
): Source {
  const frequency = midiToHz(midi);
  switch (wave.type) {
    case 'noise': {
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer(context, wave.color);
      noise.loop = true;
      noise.playbackRate.value = frequency / midiToHz(69);
      noise.detune.value = detune;
      pitch.connect(noise.detune);
      return { output: noise, nodes: [noise] };
    }
    case 'fm': {
      const carrier = oscillator(context, 'sine', frequency, detune, pitch);
      const modulator = oscillator(context, 'sine', frequency * wave.ratio, detune, pitch);
      // Depth in Hz scales with the modulator frequency so the timbre is the same on every note.
      const hzPerIndex = frequency * wave.ratio;
      const depth = context.createGain();
      depth.gain.setValueAtTime(wave.index * hzPerIndex, start);
      if (wave.indexTo !== undefined && wave.indexTime) {
        depth.gain.linearRampToValueAtTime(wave.indexTo * hzPerIndex, Math.min(start + wave.indexTime, end));
      }
      modulator.connect(depth).connect(carrier.frequency);
      return { output: carrier, nodes: [carrier, modulator] };
    }
    case 'pulse': {
      const osc = oscillator(context, 'sine', frequency, detune, pitch);
      osc.setPeriodicWave(pulseWave(context, wave.duty));
      return { output: osc, nodes: [osc] };
    }
    case 'saw':
      return single(oscillator(context, 'sawtooth', frequency, detune, pitch));
    case 'triangle':
      return single(oscillator(context, 'triangle', frequency, detune, pitch));
    case 'sine':
      return single(oscillator(context, 'sine', frequency, detune, pitch));
  }
}

function single(node: OscillatorNode): Source {
  return { output: node, nodes: [node] };
}

function oscillator(
  context: BaseAudioContext,
  type: OscillatorType,
  frequency: number,
  detune: number,
  pitch: ConstantSourceNode,
): OscillatorNode {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;
  pitch.connect(osc.detune);
  return osc;
}

function addVibrato(
  context: BaseAudioContext,
  target: AudioParam,
  vibrato: NonNullable<Patch['vibrato']>,
  start: number,
): OscillatorNode {
  const lfo = context.createOscillator();
  lfo.frequency.value = vibrato.rate;
  const depth = context.createGain();
  const onset = start + (vibrato.delay ?? 0);
  depth.gain.setValueAtTime(0, start);
  depth.gain.setValueAtTime(0, onset);
  depth.gain.linearRampToValueAtTime(vibrato.depth, onset + VIBRATO_FADE_IN);
  lfo.connect(depth).connect(target);
  return lfo;
}

function addFilter(
  context: BaseAudioContext,
  output: AudioNode,
  filter: NonNullable<Patch['filter']>,
  start: number,
): BiquadFilterNode {
  const node = context.createBiquadFilter();
  node.type = filter.type;
  node.Q.value = filter.q ?? 0.7;
  node.frequency.setValueAtTime(filter.frequency, start);
  if (filter.to !== undefined && filter.time) {
    node.frequency.exponentialRampToValueAtTime(filter.to, start + filter.time);
  }
  node.connect(output);
  return node;
}
