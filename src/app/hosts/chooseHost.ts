import type { HostKind } from './types';

/**
 * `?host=` wins; otherwise the room when WebGL is available, else the flat TV
 * (docs/ARCHITECTURE.md › App).
 */
export function chooseHost(requested: string | null, hasWebGL: () => boolean): HostKind {
  if (requested === 'flat' || requested === 'room') return requested;
  return hasWebGL() ? 'room' : 'flat';
}

export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}
