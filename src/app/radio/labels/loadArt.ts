/**
 * Fetches a cover or a disc print and decodes it off the main thread at the size it is
 * drawn (`createImageBitmap` with a resize), so a 512² print never costs a frame.
 * Covers may live on another host only if it sends CORS headers: they are drawn into a
 * texture.
 */
export async function loadArt(url: string, size: number): Promise<ImageBitmap> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const blob = await response.blob();
  try {
    return await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  } catch {
    // Older Safari decodes without the resize options; drawing scales it instead.
    return createImageBitmap(blob);
  }
}
