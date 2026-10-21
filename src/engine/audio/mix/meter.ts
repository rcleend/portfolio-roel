/** Loudness and safety figures for rendered audio, in dBFS where noted. */
export interface AudioMeasurement {
  readonly seconds: number;
  /** Largest absolute sample, linear. */
  readonly peak: number;
  readonly peakDb: number;
  /** RMS over the whole render. */
  readonly rmsDb: number;
  /**
   * Gated loudness: mean power of the 400 ms blocks louder than -50 dBFS,
   * so silences and fade-outs do not drag a track's figure down. A simple
   * stand-in for broadcast loudness metering, good for matching tracks.
   */
  readonly loudnessDb: number;
  /** Peak of the final 50 ms: a bounded effect should have died away by then. */
  readonly tailPeakDb: number;
  /** Count of NaN or infinite samples, which must be zero. */
  readonly nonFinite: number;
}

const BLOCK_SECONDS = 0.4;
const GATE_DB = -50;
const TAIL_SECONDS = 0.05;

export function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : Number.NEGATIVE_INFINITY;
}

export function measure(channels: readonly Float32Array[], sampleRate: number): AudioMeasurement {
  const length = channels[0]?.length ?? 0;
  const blockLength = Math.max(1, Math.round(BLOCK_SECONDS * sampleRate));
  const tailStart = Math.max(0, length - Math.round(TAIL_SECONDS * sampleRate));
  let peak = 0;
  let tailPeak = 0;
  let sum = 0;
  let nonFinite = 0;
  let blockSum = 0;
  let blockCount = 0;
  let gatedSum = 0;
  let gatedBlocks = 0;
  const gate = 10 ** (GATE_DB / 10);
  const closeBlock = (): void => {
    const power = blockSum / (blockCount * channels.length);
    if (power > gate) {
      gatedSum += power;
      gatedBlocks++;
    }
    blockSum = 0;
    blockCount = 0;
  };

  for (let i = 0; i < length; i++) {
    for (const channel of channels) {
      const sample = channel[i] ?? 0;
      if (!Number.isFinite(sample)) {
        nonFinite++;
        continue;
      }
      const magnitude = Math.abs(sample);
      if (magnitude > peak) peak = magnitude;
      if (i >= tailStart && magnitude > tailPeak) tailPeak = magnitude;
      sum += sample * sample;
      blockSum += sample * sample;
    }
    blockCount++;
    if (blockCount === blockLength) closeBlock();
  }
  if (blockCount > 0) closeBlock();

  const meanSquare = length > 0 && channels.length > 0 ? sum / (length * channels.length) : 0;
  return {
    seconds: length / sampleRate,
    peak,
    peakDb: toDb(peak),
    rmsDb: toDb(Math.sqrt(meanSquare)),
    loudnessDb: gatedBlocks > 0 ? 10 * Math.log10(gatedSum / gatedBlocks) : Number.NEGATIVE_INFINITY,
    tailPeakDb: toDb(tailPeak),
    nonFinite,
  };
}
