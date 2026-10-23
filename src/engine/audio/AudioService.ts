/**
 * The sound contract scenes program against. The engine stays generic over
 * track and effect ids; the game narrows them to its own unions
 * (`game/audio/ids.ts`), so a typo in an id is a compile error.
 */
export interface AudioService<MusicId extends string = string, SfxId extends string = string> {
  /** Resumes the audio context. Browsers require a user gesture before any sound plays. */
  unlock(): Promise<void>;
  playMusic(id: MusicId, options?: MusicOptions): void;
  stopMusic(options?: { readonly fadeOutMs?: number }): void;
  playSfx(id: SfxId, options?: SfxOptions): void;
  /**
   * Freezes or thaws everything that is playing, keeping positions. Hosts call
   * this when the game is set aside (e.g. the camera leaves the TV).
   */
  setPaused(paused: boolean): void;
  muted: boolean;
}

export interface MusicOptions {
  /** Defaults to true. */
  readonly loop?: boolean;
  readonly fadeInMs?: number;
}

export interface SfxOptions {
  /** Stereo position, -1 (left) to 1 (right). */
  readonly pan?: number;
  /** Pitch offset in cents, for variety on repeated effects. */
  readonly detune?: number;
}
