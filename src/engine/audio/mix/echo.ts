import type { EchoSettings } from '../sequencer/song';

/**
 * A tempo-synced feedback echo with a darkening filter in the loop, the
 * classic way 90s arcade soundtracks added depth without a reverb chip.
 * Returns the send input; the repeats go to `output`.
 */
export function createEcho(
  context: BaseAudioContext,
  settings: EchoSettings,
  bpm: number,
  output: AudioNode,
): AudioNode {
  const seconds = (settings.beats * 60) / bpm;
  const input = new GainNode(context, { gain: 1 });
  const delay = new DelayNode(context, { delayTime: seconds, maxDelayTime: Math.max(1, seconds) });
  const tone = new BiquadFilterNode(context, { type: 'lowpass', frequency: settings.tone ?? 3000, Q: 0.5 });
  const feedback = new GainNode(context, { gain: Math.min(settings.feedback, 0.95) });
  input.connect(delay).connect(tone);
  tone.connect(feedback).connect(delay);
  tone.connect(output);
  return input;
}
