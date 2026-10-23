/**
 * A tiny oscilloscope and peak meter for the lab: draws the final mix so a
 * listener can see clipping or silence at a glance.
 */
export function startScope(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const samples = new Float32Array(analyser.fftSize);
  const draw = (): void => {
    analyser.getFloatTimeDomainData(samples);
    const { width, height } = canvas;
    context.fillStyle = '#06050c';
    context.fillRect(0, 0, width, height);
    let peak = 0;
    context.fillStyle = '#9aa5ff';
    for (let x = 0; x < width; x++) {
      const sample = samples[Math.floor((x / width) * samples.length)] ?? 0;
      peak = Math.max(peak, Math.abs(sample));
      context.fillRect(x, Math.round(height / 2 - sample * (height / 2)), 1, 2);
    }
    context.fillStyle = peak > 0.95 ? '#ff6b6b' : '#ffd166';
    context.fillRect(width - 8, height - peak * height, 8, peak * height);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
