/** A cover or print that has not arrived in this long is given up on: its disc gets a plain print with its text. */
export const ART_TIMEOUT_MS = 6000;

/**
 * Fetches a cover or a disc print and decodes it off the main thread at the size it is
 * drawn (`createImageBitmap` with a resize), so a 512² print never costs a frame.
 * Covers may live on another host only if it sends CORS headers: they are drawn into a
 * texture. The prints are handed to the room together, so one that stalls (a slow host)
 * would hold back every disc's: it gives up after ART_TIMEOUT_MS.
 */
export async function loadArt(url: string, size: number): Promise<ImageBitmap> {
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ART_TIMEOUT_MS) : undefined;
  const response = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const blob = await response.blob();
  try {
    return await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  } catch {
    // Older Safari decodes without the resize options; drawing scales it instead.
    return createImageBitmap(blob);
  }
}
