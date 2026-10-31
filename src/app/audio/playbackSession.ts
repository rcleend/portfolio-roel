/**
 * iOS plays Web Audio in the "ambient" audio session, which the ringer switch silences: on a phone in silent mode
 * the game, the rain and the radio's mechanics stayed mute until a CD (a media element, which takes the "playback"
 * session) had played (round six, item 31). Turning the sound on therefore claims the playback session, inside the
 * gesture: through `navigator.audioSession` where Safari has it (16.4+), else, on older iOS, by playing a moment of
 * silence on a media element, which does the same. Turning it off hands the session back, so a muted page never
 * interrupts the visitor's own music.
 */

interface AudioSessionLike {
  type: string;
}

let silence: HTMLAudioElement | null = null;

export function claimPlayback(claim: boolean): void {
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  if (session) {
    try {
      session.type = claim ? 'playback' : 'auto';
    } catch {
      // A browser that refuses the type keeps its own.
    }
  }
  // Older iOS (before Safari 16.4) has no audioSession: there a moment of silence on a media element claims it.
  if (!claim || session || !olderIos()) return;
  try {
    silence ??= createSilence();
    silence.currentTime = 0;
    silence.play()?.catch(() => undefined);
  } catch {
    // No media elements (or no Blob URLs): nothing to claim with.
  }
}

/** WebKit on a touch device (Safari, and iOS's other browsers, which are WebKit too), not Chrome or Android. */
function olderIos(): boolean {
  const agent = navigator.userAgent;
  return navigator.maxTouchPoints > 0 && /AppleWebKit/.test(agent) && !/Chrome\/|Android/.test(agent);
}

/** A tenth of a second of 8 kHz, 8-bit mono silence as a WAV, made here rather than shipped. */
function createSilence(): HTMLAudioElement {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples).fill(128);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  const element = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
  element.setAttribute('playsinline', '');
  return element;
}
