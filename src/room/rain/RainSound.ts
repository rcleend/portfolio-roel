/** The supplied recording, decoded once at 24 kHz (~23 MB), played by the audio clock, never a JS loop timer. */
export class RainSound {
  private readonly context = new AudioContext({ sampleRate: 24000, latencyHint: 'playback' });
  private readonly gain = this.context.createGain();
  private readonly abort = new AbortController();
  private source: AudioBufferSourceNode | null = null;
  private wanted = false;
  private unlocked = false;
  private disposed = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly gestures = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;

  constructor() {
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    for (const event of this.gestures) window.addEventListener(event, this.onGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', this.sync);
    this.sync();
    void this.load().catch((error: unknown) => {
      if (!this.disposed) console.warn('Rain ambience unavailable:', error);
    });
  }

  get ready(): boolean {
    return this.source !== null;
  }

  get playing(): boolean {
    return this.ready && this.wanted && !document.hidden && this.context.state === 'running';
  }

  setActive(active: boolean): void {
    if (this.wanted === active) return;
    this.wanted = active;
    this.sync();
  }

  private async load(): Promise<void> {
    const response = await fetch(`${import.meta.env.BASE_URL}audio/attic-rain.mp3`, { signal: this.abort.signal });
    if (!response.ok) throw new Error(`Rain audio: ${response.status}`);
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    if (this.disposed) return;
    // The final eight seconds become an equal-power blend into the beginning. Looping back to t=8 then
    // continues the incoming recording sample-for-sample, without MP3 padding, a silent gap or a level dip.
    const overlap = Math.min(8, buffer.duration / 4);
    const frames = Math.round(overlap * buffer.sampleRate);
    const blend = new OfflineAudioContext(buffer.numberOfChannels, frames, buffer.sampleRate);
    for (const incoming of [false, true]) {
      const source = blend.createBufferSource();
      source.buffer = buffer;
      const gain = blend.createGain();
      const curve = Float32Array.from({ length: 256 }, (_, i) => {
        const t = i / 255;
        const angle = t * t * (3 - 2 * t) * Math.PI * 0.5;
        return incoming ? Math.sin(angle) : Math.cos(angle);
      });
      gain.gain.setValueCurveAtTime(curve, 0, overlap);
      source.connect(gain).connect(blend.destination);
      source.start(0, incoming ? 0 : buffer.duration - overlap);
    }
    const seam = await blend.startRendering();
    if (this.disposed) return;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++)
      buffer.copyToChannel(seam.getChannelData(channel), channel, buffer.length - frames);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = frames / buffer.sampleRate;
    source.loopEnd = buffer.duration;
    source.connect(this.gain);
    source.start(0, source.loopStart);
    this.source = source;
    this.sync();
  }

  /**
   * Every gesture resumes the context, wanted or not, so iOS lets it start: the tap that turns the sound on lands its
   * touch events before the mute changes, and a resume made later, outside the gesture, would be refused. Sync then
   * puts it back to sleep after 200 ms when it is not wanted. Once a gesture has started it, a script may resume it.
   */
  private readonly onGesture = (): void => {
    if (this.disposed) return;
    if (!this.unlocked && this.context.state !== 'running') {
      void this.context.resume().then(
        () => {
          this.unlocked = true;
        },
        () => {},
      );
    }
    this.sync();
  };

  private readonly sync = (): void => {
    if (this.disposed) return;
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    const active = this.wanted && !document.hidden;
    const now = this.context.currentTime;
    this.gain.gain.cancelAndHoldAtTime(now);
    this.gain.gain.linearRampToValueAtTime(active ? 0.32 : 0, now + 0.18);
    if (active) {
      // Blocked autoplay is retried from the next real gesture; navigation never waits on audio.
      void this.context.resume().catch(() => {});
    } else {
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (!this.disposed && (!this.wanted || document.hidden)) void this.context.suspend().catch(() => {});
      }, 200);
    }
  };

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    for (const event of this.gestures) window.removeEventListener(event, this.onGesture, true);
    document.removeEventListener('visibilitychange', this.sync);
    this.source?.stop();
    this.source?.disconnect();
    this.gain.disconnect();
    void this.context.close().catch(() => {});
  }
}
